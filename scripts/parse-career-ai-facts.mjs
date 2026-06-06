#!/usr/bin/env node
// parse-career-ai-facts.mjs — Idempotent seed generator for:
//   supabase/seed/ai_career_impact_seed.sql  (table: ai_career_impact)
//   supabase/seed/career_facts_seed.sql      (table: career_facts)
//
// Sources:
//   - ai_career_impact_context CSV (60 rows)
//   - Iskotify_Career_Destinations__COURSE_INDEX.csv   (course_id lookup)
//   - Iskotify_Career_Destinations__QUICK_REF.csv      (~30 rows)
//   - Iskotify_Career_Destinations__SUMMARY.csv        (Notes for AI + Student Tip per course)
//
// Self-contained ESM. Does NOT connect to the database.
// Usage: node scripts/parse-career-ai-facts.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Re-import helpers from scholarshipNormalize.mjs
import { stripBom, decodeMojibake, resolveSentinel, slugify } from './scholarshipNormalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// RFC4180 quote-aware CSV parser (copied from import-upcat-questions.mjs)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------
/** Escape a string for SQL single-quoted literal. */
function sq(v) {
  if (v == null) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

/** Emit a text[] literal from an array of strings. */
function pgTextArray(arr) {
  if (!arr || arr.length === 0) return `'{}'`
  const escaped = arr.map(s => `"${String(s).replace(/"/g, '""').replace(/\\/g, '\\\\')}"`)
  return `ARRAY[${arr.map(s => sq(s)).join(', ')}]`
}

/** Parse int from a field, return null on failure. */
function parseIntField(v) {
  const n = parseInt((v ?? '').toString().trim(), 10)
  return isNaN(n) ? null : n
}

/** Truthy parse for board_exam field. */
function parseBool(v) {
  const s = (v ?? '').toString().trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}

// ---------------------------------------------------------------------------
// Normalize course name for matching (lowercase, strip non-alphanumeric, collapse spaces)
// ---------------------------------------------------------------------------
function normName(s) {
  return (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// ---------------------------------------------------------------------------
// Load CSVs
// ---------------------------------------------------------------------------
const BASE = 'C:/Users/User/Downloads/Iskotify Upgrades'

function loadCSV(path) {
  const raw = readFileSync(path, 'utf8')
  return parseCSV(decodeMojibake(stripBom(raw)))
}

const aiRows = loadCSV(`${BASE}/ai_career_impact_context - ai_career_impact_context.csv.csv`)
const indexRows = loadCSV(`${BASE}/_extracted/Iskotify_Career_Destinations__COURSE_INDEX.csv`)
const quickRefRows = loadCSV(`${BASE}/_extracted/Iskotify_Career_Destinations__QUICK_REF.csv`)
const summaryRows = loadCSV(`${BASE}/_extracted/Iskotify_Career_Destinations__SUMMARY.csv`)

// ---------------------------------------------------------------------------
// Build AI impact data rows
// ---------------------------------------------------------------------------
const aiHeader = aiRows[0].map(h => h.trim())
const aiData = aiRows.slice(1).filter(r => (r[0] ?? '').trim() !== '')
const aiGet = (cells, col) => (cells[aiHeader.indexOf(col)] ?? '').trim()

// ---------------------------------------------------------------------------
// Build COURSE_INDEX lookup
// ---------------------------------------------------------------------------
const ciHeaderIdx = indexRows.findIndex(r => r[0] === 'course_id')
const ciHeader = indexRows[ciHeaderIdx]
const ciData = indexRows.slice(ciHeaderIdx + 1).filter(r => (r[0] ?? '').trim())

// Map: normalized name → { course_id, course_name }
const indexByNorm = new Map()
for (const r of ciData) {
  const name = (r[1] ?? '').trim()
  const norm = normName(name)
  indexByNorm.set(norm, { course_id: r[0].trim(), course_name: name })
}

// Also index by "core" name = strip leading BS/AB/Doctor of prefix for partial matching
function coreNorm(norm) {
  return norm
    .replace(/^(bs|ab|abbs|doctor of|juris doctor jd)\s+/, '')
    .replace(/\s*\(.*?\)/g, '')  // strip parenthetical
    .trim()
}

const indexByCore = new Map()
for (const [norm, val] of indexByNorm) {
  const core = coreNorm(norm)
  if (!indexByCore.has(core)) indexByCore.set(core, val)
}

/**
 * Manual overrides for AI impact course names that don't auto-match.
 * Key = normalized AI impact course_name.
 */
const MANUAL_OVERRIDES = new Map([
  // AI name → course_id from COURSE_INDEX
  ['computer science', 'IT-001'],
  ['information technology', 'IT-004'],
  ['computer engineering', 'ENG-007'],
  ['electronics communications engineering', 'ENG-009'],
  ['electrical engineering', 'ENG-008'],
  ['mechanical engineering', 'ENG-017'],
  ['civil engineering', 'ENG-006'],
  ['chemical engineering', 'ENG-005'],
  ['industrial engineering', 'ENG-013'],
  ['geodetic engineering', 'ENG-012'],
  ['metallurgical engineering', 'ENG-020'],
  ['sanitary engineering', 'ENG-024'],
  ['agricultural engineering', 'ENG-001'],
  ['medicine', 'OTH-008'],
  ['nursing', 'HLT-005'],
  ['medical technology', 'HLT-003'],
  ['physical therapy', 'HLT-009'],
  ['occupational therapy', 'HLT-007'],
  ['dentistry', 'HLT-001'],
  ['pharmacy', 'HLT-008'],
  ['nutrition and dietetics', 'HLT-006'],
  ['veterinary medicine', 'OTH-014'],
  ['food technology', 'ENG-011'],
  ['accountancy', 'BUS-001'],
  ['business administration', 'OTH-006'],
  ['economics', 'OTH-004'],
  ['law', 'OTH-009'],
  ['criminology', 'OTH-003'],
  ['psychology', 'SOC-005'],
  ['guidance and counseling', 'SOC-002'],
  ['social work', 'SOC-006'],
  ['library and information science', 'IT-005'],
  ['education', 'TEA-003'],
  ['architecture', 'ARCH-001'],
  ['biology life sciences', 'SCI-005'],
  ['chemistry', 'SCI-007'],
  ['physics', 'SCI-002'],
  ['mathematics and statistics', 'SCI-001'],
  ['geology', 'SCI-009'],
  ['agriculture', 'OTH-013'],
  ['fisheries technology', 'OTH-011'],
  ['marine transportation', 'MAR-001'],
  ['aviation', 'ENG-003'],
  ['tourism and hospitality management', 'BUS-003'],
  ['mass communication and journalism', 'OTH-002'],
  ['fine arts and multimedia arts', 'ARCH-003'],
  ['political science', 'OTH-001'],
  ['hotel and restaurant management', 'BUS-003'],
  ['environmental science', 'SCI-008'],
])

// Build course_id lookup by course_id (for summary join)
const ciById = new Map()
for (const r of ciData) ciById.set(r[0].trim(), { course_id: r[0].trim(), course_name: (r[1] ?? '').trim() })

function resolveAiCourseId(aiCourseName) {
  const norm = normName(aiCourseName)
  // 1. Direct normalized match
  if (indexByNorm.has(norm)) return { course_id: indexByNorm.get(norm).course_id, matched: true }
  // 2. Manual override
  if (MANUAL_OVERRIDES.has(norm)) {
    const cid = MANUAL_OVERRIDES.get(norm)
    return { course_id: cid, matched: true }
  }
  // 3. Core norm match
  const core = coreNorm(norm)
  if (indexByCore.has(core)) return { course_id: indexByCore.get(core).course_id, matched: true }
  // 4. Unmatched — generate synthetic ID
  return { course_id: `AI-${slugify(aiCourseName)}`, matched: false }
}

// ---------------------------------------------------------------------------
// Process AI impact rows
// ---------------------------------------------------------------------------
console.log('\n=== Processing ai_career_impact ===')
const aiImpactRecords = []
const unmatchedCourses = []
const seenAiCourseIds = new Set()

for (const cells of aiData) {
  const course_name = aiGet(cells, 'course_name')
  if (!course_name) continue

  const { course_id, matched } = resolveAiCourseId(course_name)
  if (!matched) unmatchedCourses.push(course_name)

  // Avoid duplicate PKs (shouldn't happen but guard anyway)
  const finalCourseId = seenAiCourseIds.has(course_id) ? `${course_id}-dup-${seenAiCourseIds.size}` : course_id
  seenAiCourseIds.add(finalCourseId)

  const splitSemi = (v) =>
    (v ?? '').split(';').map(s => s.trim()).filter(Boolean)

  const has_board_exam = parseBool(aiGet(cells, 'has_board_exam'))
  const board_exam_name = resolveSentinel(aiGet(cells, 'board_exam_name'))
  const automation_risk_low = parseIntField(aiGet(cells, 'automation_risk_low_pct'))
  const automation_risk_high = parseIntField(aiGet(cells, 'automation_risk_high_pct'))
  const ai_safety_score = parseIntField(aiGet(cells, 'ai_safety_score'))
  const ai_safety_label = resolveSentinel(aiGet(cells, 'ai_safety_label'))
  const color_code = resolveSentinel(aiGet(cells, 'color_code'))
  const what_ai_takes_over = splitSemi(aiGet(cells, 'what_ai_takes_over'))
  const what_stays_human = splitSemi(aiGet(cells, 'what_stays_human'))
  const new_jobs_emerging = splitSemi(aiGet(cells, 'new_jobs_emerging'))
  const skills_to_develop = splitSemi(aiGet(cells, 'skills_to_develop'))
  const career_outlook_2030 = resolveSentinel(aiGet(cells, 'career_outlook_2030'))
  const key_stat = resolveSentinel(aiGet(cells, 'key_stat'))
  const key_source = resolveSentinel(aiGet(cells, 'key_source'))
  const key_quote = resolveSentinel(aiGet(cells, 'key_quote'))
  const quote_by = resolveSentinel(aiGet(cells, 'quote_by'))
  const ph_advantage = resolveSentinel(aiGet(cells, 'ph_universities_advantage'))
  const ph_notes = resolveSentinel(aiGet(cells, 'ph_context_notes'))
  const kuya_baw_summary = resolveSentinel(aiGet(cells, 'kuya_baw_summary'))
  const cluster = resolveSentinel(aiGet(cells, 'course_cluster'))
  const course_code = resolveSentinel(aiGet(cells, 'course_code'))
  const last_updated = resolveSentinel(aiGet(cells, 'last_updated'))

  aiImpactRecords.push({
    course_id: finalCourseId,
    course_name,
    course_code,
    cluster,
    has_board_exam,
    board_exam_name,
    automation_risk_low,
    automation_risk_high,
    ai_safety_score,
    ai_safety_label,
    color_code,
    what_ai_takes_over,
    what_stays_human,
    new_jobs_emerging,
    skills_to_develop,
    career_outlook_2030,
    key_stat,
    key_source,
    key_quote,
    quote_by,
    ph_advantage,
    ph_notes,
    kuya_baw_summary,
    last_updated,
  })
}

console.log(`ai_impact rows: ${aiImpactRecords.length}`)
console.log(`matched: ${aiImpactRecords.length - unmatchedCourses.length}, unmatched: ${unmatchedCourses.length}`)
if (unmatchedCourses.length > 0) {
  console.log('Unmatched courses:', unmatchedCourses)
}

// ---------------------------------------------------------------------------
// Build ai_career_impact SQL
// ---------------------------------------------------------------------------
function buildAiImpactSQL(records) {
  const lines = []
  lines.push('-- ai_career_impact_seed.sql')
  lines.push('-- Auto-generated by scripts/parse-career-ai-facts.mjs. DO NOT edit manually.')
  lines.push('-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE).')
  lines.push('')
  lines.push('INSERT INTO ai_career_impact (')
  lines.push('  course_id, course_name, course_code, cluster, board_exam, board_exam_name,')
  lines.push('  automation_risk_low, automation_risk_high, ai_safety_score, ai_safety_label,')
  lines.push('  color_code, what_ai_takes_over, what_stays_human, new_jobs_emerging,')
  lines.push('  skills_to_develop, career_outlook_2030, key_stat, key_source, key_quote,')
  lines.push('  quote_by, ph_advantage, ph_notes, kuya_baw_summary, last_updated')
  lines.push(') VALUES')

  const valueLines = records.map((r, idx) => {
    const v = [
      sq(r.course_id),
      sq(r.course_name),
      r.course_code != null ? sq(r.course_code) : 'NULL',
      r.cluster != null ? sq(r.cluster) : 'NULL',
      r.has_board_exam ? 'TRUE' : 'FALSE',
      r.board_exam_name != null ? sq(r.board_exam_name) : 'NULL',
      r.automation_risk_low != null ? r.automation_risk_low : 'NULL',
      r.automation_risk_high != null ? r.automation_risk_high : 'NULL',
      r.ai_safety_score != null ? r.ai_safety_score : 'NULL',
      r.ai_safety_label != null ? sq(r.ai_safety_label) : 'NULL',
      r.color_code != null ? sq(r.color_code) : 'NULL',
      pgTextArray(r.what_ai_takes_over),
      pgTextArray(r.what_stays_human),
      pgTextArray(r.new_jobs_emerging),
      pgTextArray(r.skills_to_develop),
      r.career_outlook_2030 != null ? sq(r.career_outlook_2030) : 'NULL',
      r.key_stat != null ? sq(r.key_stat) : 'NULL',
      r.key_source != null ? sq(r.key_source) : 'NULL',
      r.key_quote != null ? sq(r.key_quote) : 'NULL',
      r.quote_by != null ? sq(r.quote_by) : 'NULL',
      r.ph_advantage != null ? sq(r.ph_advantage) : 'NULL',
      r.ph_notes != null ? sq(r.ph_notes) : 'NULL',
      r.kuya_baw_summary != null ? sq(r.kuya_baw_summary) : 'NULL',
      r.last_updated != null ? sq(r.last_updated) : 'NULL',
    ]
    const comma = idx < records.length - 1 ? ',' : ''
    return `  (${v.join(', ')})${comma}`
  })

  lines.push(...valueLines)
  lines.push('ON CONFLICT (course_id) DO UPDATE SET')
  lines.push('  course_name          = EXCLUDED.course_name,')
  lines.push('  course_code          = EXCLUDED.course_code,')
  lines.push('  cluster              = EXCLUDED.cluster,')
  lines.push('  board_exam           = EXCLUDED.board_exam,')
  lines.push('  board_exam_name      = EXCLUDED.board_exam_name,')
  lines.push('  automation_risk_low  = EXCLUDED.automation_risk_low,')
  lines.push('  automation_risk_high = EXCLUDED.automation_risk_high,')
  lines.push('  ai_safety_score      = EXCLUDED.ai_safety_score,')
  lines.push('  ai_safety_label      = EXCLUDED.ai_safety_label,')
  lines.push('  color_code           = EXCLUDED.color_code,')
  lines.push('  what_ai_takes_over   = EXCLUDED.what_ai_takes_over,')
  lines.push('  what_stays_human     = EXCLUDED.what_stays_human,')
  lines.push('  new_jobs_emerging    = EXCLUDED.new_jobs_emerging,')
  lines.push('  skills_to_develop    = EXCLUDED.skills_to_develop,')
  lines.push('  career_outlook_2030  = EXCLUDED.career_outlook_2030,')
  lines.push('  key_stat             = EXCLUDED.key_stat,')
  lines.push('  key_source           = EXCLUDED.key_source,')
  lines.push('  key_quote            = EXCLUDED.key_quote,')
  lines.push('  quote_by             = EXCLUDED.quote_by,')
  lines.push('  ph_advantage         = EXCLUDED.ph_advantage,')
  lines.push('  ph_notes             = EXCLUDED.ph_notes,')
  lines.push('  kuya_baw_summary     = EXCLUDED.kuya_baw_summary,')
  lines.push('  last_updated         = EXCLUDED.last_updated;')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Build QUICK_REF career facts
// ---------------------------------------------------------------------------
console.log('\n=== Processing career_facts: QUICK_REF ===')

const qrHeaderIdx = quickRefRows.findIndex(r => r[0] === 'Query Type')
const qrHeader = quickRefRows[qrHeaderIdx]
const qrData = quickRefRows.slice(qrHeaderIdx + 1).filter(r => (r[0] ?? '').trim())
const qrGet = (cells, col) => (cells[qrHeader.indexOf(col)] ?? '').trim()

const quickRefFacts = []
const seenQrIds = new Map() // id → count for dedup

for (const cells of qrData) {
  const queryType = qrGet(cells, 'Query Type')
  const courseCountry = qrGet(cells, 'Course / Country')
  const quickAnswer = resolveSentinel(qrGet(cells, 'Quick Answer'))
  const keyCaveat = resolveSentinel(qrGet(cells, 'Key Caveat'))
  const pointTo = resolveSentinel(qrGet(cells, 'Point to Sheet'))

  if (!courseCountry || !quickAnswer) continue

  const baseId = slugify(`${queryType}-${courseCountry}`)
  let id = baseId
  if (seenQrIds.has(baseId)) {
    const cnt = seenQrIds.get(baseId) + 1
    seenQrIds.set(baseId, cnt)
    id = `${baseId}-${cnt}`
  } else {
    seenQrIds.set(baseId, 1)
  }

  quickRefFacts.push({
    id,
    query_type: queryType,
    course_name: courseCountry,
    quick_answer: quickAnswer,
    key_caveat: keyCaveat,
    point_to: pointTo,
  })
}

console.log(`quick_ref facts: ${quickRefFacts.length}`)

// ---------------------------------------------------------------------------
// Build SUMMARY career facts (Notes for AI)
// ---------------------------------------------------------------------------
console.log('\n=== Processing career_facts: SUMMARY notes ===')

const sumHeaderIdx = summaryRows.findIndex(r => r[0] === 'course_id')
const sumHeader = summaryRows[sumHeaderIdx]
const sumData = summaryRows.slice(sumHeaderIdx + 1).filter(r => (r[0] ?? '').trim())
const sumGet = (cells, col) => {
  const idx = sumHeader.indexOf(col)
  return idx >= 0 ? (cells[idx] ?? '').trim() : ''
}

const summaryFacts = []
const seenSumIds = new Set()

for (const cells of sumData) {
  const course_id = (cells[0] ?? '').trim()
  if (!course_id) continue

  const courseName = sumGet(cells, 'Course Name')
  const notesForAi = resolveSentinel(sumGet(cells, 'Notes for AI'))
  const studentTip = resolveSentinel(sumGet(cells, 'Student Tip'))

  if (!notesForAi) continue
  if (!courseName) continue

  const baseId = `note-${course_id}`
  let id = baseId
  if (seenSumIds.has(id)) {
    id = `${baseId}-2`
  }
  seenSumIds.add(id)

  summaryFacts.push({
    id,
    query_type: 'Notes',
    course_name: courseName,
    quick_answer: notesForAi,
    key_caveat: studentTip,
    point_to: 'SUMMARY',
  })
}

console.log(`summary notes facts: ${summaryFacts.length}`)

// ---------------------------------------------------------------------------
// Build AI impact career facts (kuya_baw_summary)
// ---------------------------------------------------------------------------
console.log('\n=== Processing career_facts: AI impact kuya_baw_summary ===')

const aiImpactFacts = []
const seenAiFacts = new Set()

for (const rec of aiImpactRecords) {
  if (!rec.kuya_baw_summary) continue
  if (!rec.course_name) continue

  const baseId = `aiimpact-${rec.course_id}`
  let id = baseId
  if (seenAiFacts.has(id)) {
    id = `${baseId}-2`
  }
  seenAiFacts.add(id)

  const keyCaveat = rec.ai_safety_score != null && rec.ai_safety_label
    ? `AI-Safe-Score ${rec.ai_safety_score}/5 (${rec.ai_safety_label})`
    : rec.ai_safety_label
      ? `AI-Safe-Score ?/5 (${rec.ai_safety_label})`
      : null

  aiImpactFacts.push({
    id,
    query_type: 'AI Impact',
    course_name: rec.course_name,
    quick_answer: rec.kuya_baw_summary,
    key_caveat: keyCaveat,
    point_to: 'AI_IMPACT',
  })
}

console.log(`ai_impact facts: ${aiImpactFacts.length}`)

// ---------------------------------------------------------------------------
// Merge all career_facts, global dedup
// ---------------------------------------------------------------------------
const allFacts = []
const globalIds = new Set()

function addFact(f) {
  if (!f.course_name || !f.quick_answer) return
  let id = f.id
  if (globalIds.has(id)) {
    let cnt = 2
    while (globalIds.has(`${id}-${cnt}`)) cnt++
    id = `${id}-${cnt}`
  }
  globalIds.add(id)
  allFacts.push({ ...f, id })
}

for (const f of quickRefFacts) addFact(f)
for (const f of summaryFacts) addFact(f)
for (const f of aiImpactFacts) addFact(f)

console.log(`\nTotal career_facts: ${allFacts.length}`)
console.log(`  quick_ref: ${quickRefFacts.length}`)
console.log(`  notes:     ${summaryFacts.length}`)
console.log(`  ai_impact: ${aiImpactFacts.length}`)

// Check for dup PKs
const idSet = new Set(allFacts.map(f => f.id))
if (idSet.size !== allFacts.length) {
  console.error('ERROR: duplicate PKs in career_facts!')
  process.exit(1)
}
console.log('No duplicate career_facts PKs.')

// ---------------------------------------------------------------------------
// Build career_facts SQL
// ---------------------------------------------------------------------------
function buildCareerFactsSQL(facts) {
  const lines = []
  lines.push('-- career_facts_seed.sql')
  lines.push('-- Auto-generated by scripts/parse-career-ai-facts.mjs. DO NOT edit manually.')
  lines.push('-- Idempotent: safe to re-run (ON CONFLICT DO UPDATE).')
  lines.push('-- Sources: QUICK_REF, SUMMARY (Notes for AI), ai_career_impact (kuya_baw_summary).')
  lines.push('')
  lines.push('INSERT INTO career_facts (')
  lines.push('  id, query_type, course_name, quick_answer, key_caveat, point_to')
  lines.push(') VALUES')

  const valueLines = facts.map((f, idx) => {
    const v = [
      sq(f.id),
      f.query_type != null ? sq(f.query_type) : 'NULL',
      sq(f.course_name),
      sq(f.quick_answer),
      f.key_caveat != null ? sq(f.key_caveat) : 'NULL',
      f.point_to != null ? sq(f.point_to) : 'NULL',
    ]
    const comma = idx < facts.length - 1 ? ',' : ''
    return `  (${v.join(', ')})${comma}`
  })

  lines.push(...valueLines)
  lines.push('ON CONFLICT (id) DO UPDATE SET')
  lines.push('  query_type   = EXCLUDED.query_type,')
  lines.push('  course_name  = EXCLUDED.course_name,')
  lines.push('  quick_answer = EXCLUDED.quick_answer,')
  lines.push('  key_caveat   = EXCLUDED.key_caveat,')
  lines.push('  point_to     = EXCLUDED.point_to;')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Write output files
// ---------------------------------------------------------------------------
const seedDir = resolve(repoRoot, 'supabase/seed')
mkdirSync(seedDir, { recursive: true })

const aiSeedPath = resolve(seedDir, 'ai_career_impact_seed.sql')
const factsSeedPath = resolve(seedDir, 'career_facts_seed.sql')

writeFileSync(aiSeedPath, buildAiImpactSQL(aiImpactRecords), 'utf8')
writeFileSync(factsSeedPath, buildCareerFactsSQL(allFacts), 'utf8')

console.log(`\nWrote: ${aiSeedPath}`)
console.log(`Wrote: ${factsSeedPath}`)

// ---------------------------------------------------------------------------
// Spot-checks
// ---------------------------------------------------------------------------
console.log('\n=== Spot-checks ===')

// 1. AI impact: Computer Science
const cs = aiImpactRecords.find(r => r.course_name === 'Computer Science')
console.log('\n[AI Impact] Computer Science:')
console.log('  course_id:', cs?.course_id)
console.log('  ai_safety_score:', cs?.ai_safety_score, '|', cs?.ai_safety_label)
console.log('  automation_risk:', cs?.automation_risk_low, '-', cs?.automation_risk_high)
console.log('  what_ai_takes_over[0]:', cs?.what_ai_takes_over?.[0])
console.log('  kuya_baw_summary(50):', cs?.kuya_baw_summary?.substring(0, 50))

// 2. Quick ref spot-check
const qr1 = allFacts.find(f => f.query_type === 'AI Impact' && f.course_name === 'Nursing')
console.log('\n[career_facts AI Impact] Nursing:')
console.log('  id:', qr1?.id)
console.log('  key_caveat:', qr1?.key_caveat)
console.log('  quick_answer(50):', qr1?.quick_answer?.substring(0, 50))

// 3. Quick ref spot-check
const qr2 = allFacts.find(f => f.query_type !== 'AI Impact' && f.query_type !== 'Notes')
console.log('\n[career_facts quick_ref] first:')
console.log('  id:', qr2?.id)
console.log('  query_type:', qr2?.query_type)
console.log('  course_name:', qr2?.course_name)
console.log('  quick_answer(60):', qr2?.quick_answer?.substring(0, 60))

// 4. Notes spot-check
const n1 = allFacts.find(f => f.query_type === 'Notes')
console.log('\n[career_facts notes] first:')
console.log('  id:', n1?.id)
console.log('  course_name:', n1?.course_name)
console.log('  quick_answer(60):', n1?.quick_answer?.substring(0, 60))
console.log('  key_caveat(60):', n1?.key_caveat?.substring(0, 60))

// 5. Unmatched summary
console.log('\n=== Summary ===')
console.log(`ai_career_impact: ${aiImpactRecords.length} rows`)
console.log(`  matched to COURSE_INDEX: ${aiImpactRecords.length - unmatchedCourses.length}`)
console.log(`  unmatched (AI- prefix):  ${unmatchedCourses.length}`)
if (unmatchedCourses.length > 0) console.log('  unmatched names:', unmatchedCourses)
console.log(`career_facts: ${allFacts.length} rows`)
console.log(`  quick_ref:  ${allFacts.filter(f => f.query_type !== 'AI Impact' && f.query_type !== 'Notes').length}`)
console.log(`  notes:      ${allFacts.filter(f => f.query_type === 'Notes').length}`)
console.log(`  ai_impact:  ${allFacts.filter(f => f.query_type === 'AI Impact').length}`)
console.log(`No duplicate PKs: ${idSet.size === allFacts.length ? 'YES' : 'NO'}`)
