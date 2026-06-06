#!/usr/bin/env node
// One-off importer for the authored UPCAT question bank → Supabase.
// Mirrors apps/admin/lib/upcat/importUpcatCore.ts exactly (passage dedup,
// letter->index, Approved->published, options[] packing, BOM strip on row 0).
// Self-contained: custom RFC4180 CSV parser + PostgREST upsert via fetch.
// Reads creds from apps/admin/.env.local. Idempotent (on_conflict upsert).
//
// Usage: node scripts/import-upcat-questions.mjs "<path-to-csv>"

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// --- load env ---
function loadEnv(path) {
  const out = {}
  let text
  try { text = readFileSync(path, 'utf8') } catch { return out }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
const env = loadEnv(resolve(repoRoot, 'apps/admin/.env.local'))
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.local')
  process.exit(1)
}

// --- RFC4180 quote-aware CSV parser (handles embedded newlines + "" escapes) ---
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const rows = []; let row = []; let field = ''; let inQuotes = false; let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        inQuotes = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { inQuotes = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r') { i++; continue }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue }
    field += c; i++
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}

function letterToIndex(letter) {
  const idx = ['A', 'B', 'C', 'D'].indexOf((letter ?? '').trim().toUpperCase())
  if (idx === -1) throw new Error(`invalid correct_answer "${letter}"`)
  return idx
}

// --- read + parse ---
const csvPath = process.argv[2]
if (!csvPath) { console.error('Usage: node scripts/import-upcat-questions.mjs "<path-to-csv>"'); process.exit(1) }
const raw = readFileSync(csvPath, 'utf8')
const table = parseCSV(raw)
const header = table[0].map(h => h.trim().toLowerCase())
const idxOf = (name) => header.indexOf(name)
const need = ['question_id','subtest','main_subject','topic','subtopic','question_format','cognitive_level','difficulty','curriculum_alignment','has_visual','visual_type','visual_description','set_id','set_position','passage_text','question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','status']
const missing = need.filter(c => idxOf(c) === -1)
if (missing.length) { console.error('Missing columns:', missing.join(', ')); process.exit(1) }

const get = (cells, name) => (cells[idxOf(name)] ?? '')
const rows = table.slice(1).filter(cells => (get(cells, 'question_id') ?? '').trim() !== '')
console.log(`Parsed ${rows.length} question rows (from ${table.length - 1} physical data rows).`)

// --- passages: first non-empty passage_text per set_id ---
const passages = new Map()
for (const cells of rows) {
  const setId = get(cells, 'set_id').trim()
  if (!setId) continue
  const text = get(cells, 'passage_text').trim()
  if (text && !passages.has(setId)) {
    passages.set(setId, { set_id: setId, subtest: get(cells, 'subtest').trim(), passage_text: text })
  }
}

// --- questions ---
const questions = rows.map((cells, i) => {
  let qid = get(cells, 'question_id')
  if (i === 0 && qid.charCodeAt(0) === 0xFEFF) qid = qid.slice(1)
  qid = qid.trim()
  const setId = get(cells, 'set_id').trim()
  const sp = parseInt(get(cells, 'set_position').trim(), 10)
  return {
    question_id: qid,
    subtest: get(cells, 'subtest').trim(),
    main_subject: get(cells, 'main_subject').trim() || null,
    topic: get(cells, 'topic').trim() || null,
    subtopic: get(cells, 'subtopic').trim() || null,
    question_format: get(cells, 'question_format').trim() || null,
    cognitive_level: get(cells, 'cognitive_level').trim() || null,
    difficulty: get(cells, 'difficulty').trim() || null,
    curriculum_alignment: get(cells, 'curriculum_alignment').trim() || null,
    question_text: get(cells, 'question_text').trim(),
    options: [get(cells, 'option_a'), get(cells, 'option_b'), get(cells, 'option_c'), get(cells, 'option_d')].map(o => (o ?? '').trim()),
    correct_index: letterToIndex(get(cells, 'correct_answer')),
    explanation: get(cells, 'explanation').trim(),
    set_id: setId || null,
    set_position: Number.isNaN(sp) ? null : sp,
    has_visual: get(cells, 'has_visual').trim().toLowerCase() === 'yes',
    status: get(cells, 'status').trim().toLowerCase() === 'approved' ? 'published' : 'draft',
  }
})

// --- upsert via PostgREST ---
async function upsert(tableName, conflictCol, payload) {
  if (payload.length === 0) return
  const url = `${SUPABASE_URL}/rest/v1/${tableName}?on_conflict=${conflictCol}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${tableName} upsert failed (${res.status}): ${body}`)
  }
}

function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

const main = async () => {
  console.log(`Upserting ${passages.size} passages...`)
  await upsert('upcat_passages', 'set_id', [...passages.values()])
  console.log(`Upserting ${questions.length} questions...`)
  for (const c of chunk(questions, 100)) await upsert('upcat_questions', 'question_id', c)
  console.log('Done.')
  const bySubtest = {}
  for (const q of questions) bySubtest[q.subtest] = (bySubtest[q.subtest] ?? 0) + 1
  console.log('Per-subtest:', JSON.stringify(bySubtest))
  console.log('Published:', questions.filter(q => q.status === 'published').length, '/', questions.length)
}
main().catch(e => { console.error(e); process.exit(1) })
