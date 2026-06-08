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

// --- header aliasing (friendly "Question Bank" headers -> snake_case) ---
const HEADER_ALIASES = {
  'q id': 'question_id', 'question id': 'question_id', qid: 'question_id', subtest: 'subtest',
  'main subject': 'main_subject', topic: 'topic', subtopic: 'subtopic',
  format: 'question_format', 'question format': 'question_format', 'cognitive level': 'cognitive_level',
  difficulty: 'difficulty', curriculum: 'curriculum_alignment', 'curriculum alignment': 'curriculum_alignment',
  'has visual': 'has_visual', 'visual type': 'visual_type', 'visual description': 'visual_description',
  'set id': 'set_id', 'set position': 'set_position',
  'passage / set text': 'passage_text', 'passage/set text': 'passage_text', 'passage set text': 'passage_text',
  'passage text': 'passage_text', passage: 'passage_text',
  question: 'question_text', 'question text': 'question_text',
  'option a': 'option_a', 'option b': 'option_b', 'option c': 'option_c', 'option d': 'option_d',
  answer: 'correct_answer', 'correct answer': 'correct_answer', explanation: 'explanation', status: 'status',
  'date created': 'date_created', 'created by': 'created_by', notes: 'notes',
}
function normalizeHeader(raw) {
  const key = (raw ?? '').replace(/^﻿/, '').trim().toLowerCase().replace(/\s+/g, ' ')
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, '_')
}

// --- mojibake repair: invert "UTF-8 read as Windows-1252" (â€", Ã±, â±, Ã·, Â²…) ---
const CP1252_GLYPH_TO_BYTE = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}
function repairMojibake(text) {
  if (!text || !/[ÃÂâ]/.test(text)) return text
  const bytes = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)
    if (cp <= 0xff) bytes.push(cp)
    else if (CP1252_GLYPH_TO_BYTE[cp] != null) bytes.push(CP1252_GLYPH_TO_BYTE[cp])
    else return text
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)) }
  catch { return text }
}
function cleanText(v) {
  let t = (v ?? '')
  if (t.charCodeAt(0) === 0xFEFF) t = t.slice(1)
  return repairMojibake(t).trim()
}

const VALID_SUBTESTS = new Set(['Mathematics', 'Science', 'Language Proficiency', 'Reading Comprehension'])

// --- read + parse ---
const csvPath = process.argv[2]
if (!csvPath) { console.error('Usage: node scripts/import-upcat-questions.mjs "<path-to-csv>"'); process.exit(1) }
const raw = readFileSync(csvPath, 'utf8')
const table = parseCSV(raw)
const header = table[0].map(normalizeHeader)
const idxOf = (name) => header.indexOf(name)
const need = ['question_id','subtest','main_subject','topic','subtopic','question_format','cognitive_level','difficulty','curriculum_alignment','has_visual','visual_type','visual_description','set_id','set_position','passage_text','question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','status']
const missing = need.filter(c => idxOf(c) === -1)
if (missing.length) { console.error('Missing columns:', missing.join(', ')); process.exit(1) }

const get = (cells, name) => cleanText(cells[idxOf(name)] ?? '')
const rows = table.slice(1).filter(cells => get(cells, 'question_id') !== '')
console.log(`Parsed ${rows.length} question rows (from ${table.length - 1} physical data rows).`)

// --- validate subtests (must match mobile SUBTESTS) ---
const badSubtests = new Map()
for (const cells of rows) {
  const st = get(cells, 'subtest')
  if (!VALID_SUBTESTS.has(st)) badSubtests.set(st || '(empty)', get(cells, 'question_id'))
}
if (badSubtests.size) {
  const detail = [...badSubtests.entries()].map(([s, qid]) => `"${s}" (e.g. ${qid})`).join(', ')
  console.error(`Invalid subtest value(s): ${detail}. Allowed: ${[...VALID_SUBTESTS].join(', ')}.`)
  process.exit(1)
}

// --- passages: first non-empty passage_text per set_id ---
const passages = new Map()
for (const cells of rows) {
  const setId = get(cells, 'set_id')
  if (!setId) continue
  const text = get(cells, 'passage_text')
  if (text && !passages.has(setId)) {
    passages.set(setId, { set_id: setId, subtest: get(cells, 'subtest'), passage_text: text })
  }
}

// --- questions ---
const questions = rows.map((cells) => {
  const setId = get(cells, 'set_id')
  const sp = parseInt(get(cells, 'set_position'), 10)
  return {
    question_id: get(cells, 'question_id'),
    subtest: get(cells, 'subtest'),
    main_subject: get(cells, 'main_subject') || null,
    topic: get(cells, 'topic') || null,
    subtopic: get(cells, 'subtopic') || null,
    question_format: get(cells, 'question_format') || null,
    cognitive_level: get(cells, 'cognitive_level') || null,
    difficulty: get(cells, 'difficulty') || null,
    curriculum_alignment: get(cells, 'curriculum_alignment') || null,
    question_text: get(cells, 'question_text'),
    options: [get(cells, 'option_a'), get(cells, 'option_b'), get(cells, 'option_c'), get(cells, 'option_d')],
    correct_index: letterToIndex(get(cells, 'correct_answer')),
    explanation: get(cells, 'explanation'),
    set_id: setId || null,
    set_position: Number.isNaN(sp) ? null : sp,
    has_visual: get(cells, 'has_visual').toLowerCase() === 'yes',
    status: get(cells, 'status').toLowerCase() === 'approved' ? 'published' : 'draft',
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
