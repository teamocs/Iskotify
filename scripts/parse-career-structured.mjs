#!/usr/bin/env node
// parse-career-structured.mjs
// Converts 4 career CSV files into idempotent Supabase seed SQL.
// Does NOT apply to DB — caller applies the SQL files.
//
// Usage: node scripts/parse-career-structured.mjs
// Output: supabase/seed/career_{courses,destinations,countries,programs}_seed.sql

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// Import shared normalizers from scholarshipNormalize.mjs
import {
  stripBom,
  decodeMojibake,
  resolveSentinel,
  slugify,
} from './scholarshipNormalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// RFC4180 quote-aware CSV parser (copied from import-upcat-questions.mjs)
// Handles BOM, embedded newlines, "" escapes
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
// Load a CSV, find the header row whose first cell matches expectedKey
// (skips leading sheet-title / group-label rows)
// Returns { headers: string[], dataRows: string[][] }
// ---------------------------------------------------------------------------
function loadCSV(filePath, expectedKey) {
  const raw = readFileSync(filePath, 'utf8')
  const decoded = decodeMojibake(stripBom(raw))
  const allRows = parseCSV(decoded)

  // Find the header row: first row whose first cell (trimmed) === expectedKey
  let headerIdx = -1
  for (let r = 0; r < allRows.length; r++) {
    const cell = (allRows[r][0] ?? '').trim()
    if (cell === expectedKey) { headerIdx = r; break }
  }
  if (headerIdx === -1) {
    throw new Error(`Could not find header row with key "${expectedKey}" in ${filePath}`)
  }

  const headers = allRows[headerIdx].map(h => h.trim())
  // Data rows: everything after header, skip fully-empty rows
  const dataRows = allRows.slice(headerIdx + 1).filter(
    r => r.some(cell => cell.trim() !== '')
  )

  return { headers, dataRows }
}

// ---------------------------------------------------------------------------
// SQL helpers
// ---------------------------------------------------------------------------

// Escape a string value for SQL (double single-quotes)
function sqlStr(v) {
  if (v == null) return 'NULL'
  const s = String(v).replace(/'/g, "''")
  return `'${s}'`
}

// Emit a text[] literal: ARRAY['a','b'] or '{}'
function sqlArray(arr) {
  if (!arr || arr.length === 0) return "'{}'"
  const escaped = arr.map(el => `'${String(el).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`)
  return `ARRAY[${escaped.join(', ')}]`
}

// Parse leading integer from salary strings like "$45,000" "45000" "45,000/yr"
function parseSalaryInt(s) {
  if (!s) return null
  const cleaned = s.replace(/[$,\s]/g, '')
  const m = cleaned.match(/^(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return isNaN(n) ? null : n
}

// Parse integer from a string (for duration_years, timeline_months)
function parseIntField(s) {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed || resolveSentinel(trimmed) === null) return null
  const m = trimmed.match(/(\d+)/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return isNaN(n) ? null : n
}

// Parse boolean from "Y"/"N"/"Yes"/"No"/""
function parseBool(s) {
  if (!s) return null
  const t = s.trim().toLowerCase()
  if (t === 'y' || t === 'yes') return true
  if (t === 'n' || t === 'no') return false
  return null
}

// Split a comma-separated string into trimmed, non-empty, deduped array
function splitComma(s) {
  if (!s || !s.trim()) return []
  const seen = new Set()
  const out = []
  for (const part of s.split(',')) {
    const trimmed = part.trim()
    if (trimmed && !seen.has(trimmed)) { seen.add(trimmed); out.push(trimmed) }
  }
  return out
}

// Null-rate tracker
function makeNullTracker(fields) {
  const totals = {}; const nulls = {}
  for (const f of fields) { totals[f] = 0; nulls[f] = 0 }
  return {
    record(field, val) { totals[field]++; if (val === null || val === undefined) nulls[field]++ },
    report() {
      return fields.map(f => {
        const rate = totals[f] ? ((nulls[f] / totals[f]) * 100).toFixed(1) : 'n/a'
        return `  ${f}: ${nulls[f]}/${totals[f]} null (${rate}%)`
      }).join('\n')
    }
  }
}

// Column accessor from parsed CSV headers
function makeGet(headers, dataRow) {
  return (colName) => {
    const idx = headers.findIndex(h => h === colName)
    if (idx === -1) return ''
    return (dataRow[idx] ?? '').trim()
  }
}

// ---------------------------------------------------------------------------
// 1. career_courses  (COURSE_INDEX + SUMMARY merged on course_id)
// ---------------------------------------------------------------------------
function buildCoursesSeed() {
  const csvDir = 'C:\\Users\\User\\Downloads\\Iskotify Upgrades\\_extracted'

  // Load COURSE_INDEX
  const idx = loadCSV(`${csvDir}\\Iskotify_Career_Destinations__COURSE_INDEX.csv`, 'course_id')
  // Load SUMMARY
  const sum = loadCSV(`${csvDir}\\Iskotify_Career_Destinations__SUMMARY.csv`, 'course_id')

  // Build map from SUMMARY keyed by course_id
  const summaryMap = new Map()
  for (const row of sum.dataRows) {
    const get = (col) => makeGet(sum.headers, row)(col)
    const cid = get('course_id')
    if (!cid) continue
    summaryMap.set(cid, row)
  }

  const tracker = makeNullTracker([
    'name', 'cluster', 'career_tag', 'demand', 'top_countries',
    'board_exam', 'board_exam_name', 'duration_years', 'student_tip', 'ai_note',
  ])

  const rows = []
  const seenIds = new Set()
  let skipped = 0

  for (const dataRow of idx.dataRows) {
    const idxGet = (col) => makeGet(idx.headers, dataRow)(col)

    const course_id = idxGet('course_id')
    if (!course_id) { skipped++; continue }
    if (seenIds.has(course_id)) { console.warn(`  WARN: dup course_id in COURSE_INDEX: ${course_id}`); continue }
    seenIds.add(course_id)

    const name = idxGet('Course Name').trim()
    if (!name) { console.warn(`  WARN: skipping course_id=${course_id} — blank name`); skipped++; continue }

    const cluster = resolveSentinel(idxGet('Cluster'))
    const career_tag = resolveSentinel(idxGet('Career Tag'))
    const demand = resolveSentinel(idxGet('Demand'))
    const top_countries = splitComma(idxGet('Top Countries'))

    // From SUMMARY
    let board_exam = null
    let board_exam_name = null
    let duration_years = null
    let student_tip = null
    let ai_note = null

    const sumRow = summaryMap.get(course_id)
    if (sumRow) {
      const sg = (col) => makeGet(sum.headers, sumRow)(col)
      board_exam = parseBool(sg('Board Exam?'))
      board_exam_name = resolveSentinel(sg('Board Exam Name'))
      duration_years = parseIntField(sg('Duration\n(yrs)') || sg('Duration (yrs)'))
      // Try alternate header forms for duration
      if (duration_years === null) {
        // search headers for duration
        const durIdx = sum.headers.findIndex(h => h.toLowerCase().includes('duration'))
        if (durIdx !== -1) duration_years = parseIntField((sumRow[durIdx] ?? '').trim())
      }
      student_tip = resolveSentinel(sg('Student Tip'))
      ai_note = resolveSentinel(sg('Notes for AI'))
    }

    tracker.record('name', name)
    tracker.record('cluster', cluster)
    tracker.record('career_tag', career_tag)
    tracker.record('demand', demand)
    tracker.record('top_countries', top_countries.length ? top_countries : null)
    tracker.record('board_exam', board_exam)
    tracker.record('board_exam_name', board_exam_name)
    tracker.record('duration_years', duration_years)
    tracker.record('student_tip', student_tip)
    tracker.record('ai_note', ai_note)

    const tc = sqlArray(top_countries)
    const be = board_exam === null ? 'NULL' : board_exam ? 'TRUE' : 'FALSE'
    const dy = duration_years === null ? 'NULL' : duration_years

    rows.push(
      `INSERT INTO career_courses (course_id, name, cluster, career_tag, demand, top_countries, board_exam, board_exam_name, duration_years, student_tip, ai_note)\n` +
      `VALUES (${sqlStr(course_id)}, ${sqlStr(name)}, ${sqlStr(cluster)}, ${sqlStr(career_tag)}, ${sqlStr(demand)}, ${tc}, ${be}, ${sqlStr(board_exam_name)}, ${dy}, ${sqlStr(student_tip)}, ${sqlStr(ai_note)})\n` +
      `ON CONFLICT (course_id) DO UPDATE SET\n` +
      `  name = EXCLUDED.name,\n` +
      `  cluster = EXCLUDED.cluster,\n` +
      `  career_tag = EXCLUDED.career_tag,\n` +
      `  demand = EXCLUDED.demand,\n` +
      `  top_countries = EXCLUDED.top_countries,\n` +
      `  board_exam = EXCLUDED.board_exam,\n` +
      `  board_exam_name = EXCLUDED.board_exam_name,\n` +
      `  duration_years = EXCLUDED.duration_years,\n` +
      `  student_tip = EXCLUDED.student_tip,\n` +
      `  ai_note = EXCLUDED.ai_note;`
    )
  }

  console.log(`\n[career_courses] ${rows.length} rows (${skipped} skipped)`)
  console.log('Null rates:\n' + tracker.report())

  const sql =
    `-- career_courses seed (auto-generated by scripts/parse-career-structured.mjs)\n` +
    `-- Idempotent: INSERT … ON CONFLICT (course_id) DO UPDATE\n\n` +
    rows.join('\n\n') + '\n'

  return { sql, count: rows.length }
}

// ---------------------------------------------------------------------------
// 2. career_destinations  (DESTINATIONS CSV)
// ---------------------------------------------------------------------------
function buildDestinationsSeed() {
  const csvDir = 'C:\\Users\\User\\Downloads\\Iskotify Upgrades\\_extracted'
  const { headers, dataRows } = loadCSV(
    `${csvDir}\\Iskotify_Career_Destinations__DESTINATIONS.csv`,
    'course_id'
  )

  const tracker = makeNullTracker([
    'course_id', 'country', 'demand_rating', 'salary_min', 'salary_max',
    'salary_local', 'visa_pathway', 'pr_pathway', 'credential_required',
    'licensing_exam', 'language_required', 'timeline_months',
    'program_name', 'specializations', 'notes', 'saturation_warning', 'source',
  ])

  const rows = []
  const seenIds = new Set()
  let skipped = 0

  for (const dataRow of dataRows) {
    const get = (col) => makeGet(headers, dataRow)(col)

    const course_id = get('course_id')
    const country = get('Country').trim()

    if (!course_id || !country) { skipped++; continue }

    const id = `${course_id}-${slugify(country)}`

    if (seenIds.has(id)) {
      console.warn(`  WARN: dup destination id: ${id}`)
      continue
    }
    seenIds.add(id)

    // Salary columns may have embedded newlines in headers — search by partial match
    const salMinIdx = headers.findIndex(h => h.toLowerCase().includes('salary min'))
    const salMaxIdx = headers.findIndex(h => h.toLowerCase().includes('salary max'))
    const salLocalIdx = headers.findIndex(h => h.replace(/\n/g, ' ').toLowerCase().includes('salary') && h.toLowerCase().includes('local'))

    const salMinRaw = salMinIdx >= 0 ? (dataRow[salMinIdx] ?? '').trim() : ''
    const salMaxRaw = salMaxIdx >= 0 ? (dataRow[salMaxIdx] ?? '').trim() : ''
    const salLocalRaw = salLocalIdx >= 0 ? (dataRow[salLocalIdx] ?? '').trim() : ''

    const salary_min = parseSalaryInt(salMinRaw)
    const salary_max = parseSalaryInt(salMaxRaw)
    const salary_local = resolveSentinel(salLocalRaw)

    // Timeline col — partial match
    const timelineIdx = headers.findIndex(h => h.toLowerCase().includes('timeline'))
    const timelineRaw = timelineIdx >= 0 ? (dataRow[timelineIdx] ?? '').trim() : ''
    const timeline_months = parseIntField(timelineRaw)

    const demand_rating = resolveSentinel(get('Demand Rating'))
    const salary_type = resolveSentinel(get('Salary Type'))
    const visa_pathway = resolveSentinel(get('Visa Pathway'))
    const pr_raw = get('PR Pathway?').trim()
    const pr_pathway = parseBool(pr_raw)
    const credential_required = resolveSentinel(get('Credential\nRequired') || get('Credential Required'))
    const licensing_exam = resolveSentinel(get('Licensing Exam'))
    const language_required = resolveSentinel(get('Language\nRequired') || get('Language Required'))
    const program_name = resolveSentinel(get('Program Name'))
    const notes = resolveSentinel(get('Notes'))
    const saturation_warning = resolveSentinel(get('Saturation\nWarning') || get('Saturation Warning'))
    const source = resolveSentinel(get('Source'))

    // Specializations — comma-split, dedupe
    const specIdx = headers.findIndex(h => h.toLowerCase().includes('specialization'))
    const specRaw = specIdx >= 0 ? (dataRow[specIdx] ?? '').trim() : ''
    const specializations = splitComma(specRaw)

    tracker.record('course_id', course_id)
    tracker.record('country', country)
    tracker.record('demand_rating', demand_rating)
    tracker.record('salary_min', salary_min)
    tracker.record('salary_max', salary_max)
    tracker.record('salary_local', salary_local)
    tracker.record('visa_pathway', visa_pathway)
    tracker.record('pr_pathway', pr_pathway)
    tracker.record('credential_required', credential_required)
    tracker.record('licensing_exam', licensing_exam)
    tracker.record('language_required', language_required)
    tracker.record('timeline_months', timeline_months)
    tracker.record('program_name', program_name)
    tracker.record('specializations', specializations.length ? specializations : null)
    tracker.record('notes', notes)
    tracker.record('saturation_warning', saturation_warning)
    tracker.record('source', source)

    const pr = pr_pathway === null ? 'NULL' : pr_pathway ? 'TRUE' : 'FALSE'
    const specs = sqlArray(specializations)
    const sm = salary_min === null ? 'NULL' : salary_min
    const sx = salary_max === null ? 'NULL' : salary_max
    const tm = timeline_months === null ? 'NULL' : timeline_months

    rows.push(
      `INSERT INTO career_destinations (id, course_id, country, demand_rating, salary_min, salary_max, salary_local, salary_type, visa_pathway, pr_pathway, credential_required, licensing_exam, language_required, timeline_months, program_name, specializations, notes, saturation_warning, source)\n` +
      `VALUES (${sqlStr(id)}, ${sqlStr(course_id)}, ${sqlStr(country)}, ${sqlStr(demand_rating)}, ${sm}, ${sx}, ${sqlStr(salary_local)}, ${sqlStr(salary_type)}, ${sqlStr(visa_pathway)}, ${pr}, ${sqlStr(credential_required)}, ${sqlStr(licensing_exam)}, ${sqlStr(language_required)}, ${tm}, ${sqlStr(program_name)}, ${specs}, ${sqlStr(notes)}, ${sqlStr(saturation_warning)}, ${sqlStr(source)})\n` +
      `ON CONFLICT (id) DO UPDATE SET\n` +
      `  course_id = EXCLUDED.course_id,\n` +
      `  country = EXCLUDED.country,\n` +
      `  demand_rating = EXCLUDED.demand_rating,\n` +
      `  salary_min = EXCLUDED.salary_min,\n` +
      `  salary_max = EXCLUDED.salary_max,\n` +
      `  salary_local = EXCLUDED.salary_local,\n` +
      `  salary_type = EXCLUDED.salary_type,\n` +
      `  visa_pathway = EXCLUDED.visa_pathway,\n` +
      `  pr_pathway = EXCLUDED.pr_pathway,\n` +
      `  credential_required = EXCLUDED.credential_required,\n` +
      `  licensing_exam = EXCLUDED.licensing_exam,\n` +
      `  language_required = EXCLUDED.language_required,\n` +
      `  timeline_months = EXCLUDED.timeline_months,\n` +
      `  program_name = EXCLUDED.program_name,\n` +
      `  specializations = EXCLUDED.specializations,\n` +
      `  notes = EXCLUDED.notes,\n` +
      `  saturation_warning = EXCLUDED.saturation_warning,\n` +
      `  source = EXCLUDED.source;`
    )
  }

  console.log(`\n[career_destinations] ${rows.length} rows (${skipped} skipped)`)
  console.log('Null rates:\n' + tracker.report())

  const sql =
    `-- career_destinations seed (auto-generated by scripts/parse-career-structured.mjs)\n` +
    `-- Idempotent: INSERT … ON CONFLICT (id) DO UPDATE\n\n` +
    rows.join('\n\n') + '\n'

  return { sql, count: rows.length }
}

// ---------------------------------------------------------------------------
// 3. career_countries  (COUNTRY_PROFILES CSV)
// ---------------------------------------------------------------------------
function buildCountriesSeed() {
  const csvDir = 'C:\\Users\\User\\Downloads\\Iskotify Upgrades\\_extracted'
  const { headers, dataRows } = loadCSV(
    `${csvDir}\\Iskotify_Career_Destinations__COUNTRY_PROFILES.csv`,
    'Country'
  )

  const tracker = makeNullTracker([
    'name', 'region', 'immigration_system', 'why_demand_exists',
    'language_required', 'pr_pathway', 'notes_for_students',
  ])

  const rows = []
  const seenIds = new Set()
  let skipped = 0

  for (const dataRow of dataRows) {
    const get = (col) => makeGet(headers, dataRow)(col)

    const name = get('Country').trim()
    if (!name) { skipped++; continue }

    const code = slugify(name)
    if (seenIds.has(code)) {
      console.warn(`  WARN: dup country code: ${code} (from "${name}")`)
      continue
    }
    seenIds.add(code)

    const region = resolveSentinel(get('Region'))
    const immigration_system = resolveSentinel(get('Immigration System'))
    const why_demand_exists = resolveSentinel(get('Why Demand Exists'))
    const language_required = resolveSentinel(get('Language Required'))
    const pr_pathway = resolveSentinel(get('PR/Citizenship Pathway'))
    const notes_for_students = resolveSentinel(get('Notes for Students'))

    tracker.record('name', name)
    tracker.record('region', region)
    tracker.record('immigration_system', immigration_system)
    tracker.record('why_demand_exists', why_demand_exists)
    tracker.record('language_required', language_required)
    tracker.record('pr_pathway', pr_pathway)
    tracker.record('notes_for_students', notes_for_students)

    rows.push(
      `INSERT INTO career_countries (code, name, region, immigration_system, why_demand_exists, language_required, pr_pathway, notes_for_students)\n` +
      `VALUES (${sqlStr(code)}, ${sqlStr(name)}, ${sqlStr(region)}, ${sqlStr(immigration_system)}, ${sqlStr(why_demand_exists)}, ${sqlStr(language_required)}, ${sqlStr(pr_pathway)}, ${sqlStr(notes_for_students)})\n` +
      `ON CONFLICT (code) DO UPDATE SET\n` +
      `  name = EXCLUDED.name,\n` +
      `  region = EXCLUDED.region,\n` +
      `  immigration_system = EXCLUDED.immigration_system,\n` +
      `  why_demand_exists = EXCLUDED.why_demand_exists,\n` +
      `  language_required = EXCLUDED.language_required,\n` +
      `  pr_pathway = EXCLUDED.pr_pathway,\n` +
      `  notes_for_students = EXCLUDED.notes_for_students;`
    )
  }

  console.log(`\n[career_countries] ${rows.length} rows (${skipped} skipped)`)
  console.log('Null rates:\n' + tracker.report())

  const sql =
    `-- career_countries seed (auto-generated by scripts/parse-career-structured.mjs)\n` +
    `-- Idempotent: INSERT … ON CONFLICT (code) DO UPDATE\n\n` +
    rows.join('\n\n') + '\n'

  return { sql, count: rows.length }
}

// ---------------------------------------------------------------------------
// 4. career_programs  (PROGRAMS CSV)
// ---------------------------------------------------------------------------
function buildProgramsSeed() {
  const csvDir = 'C:\\Users\\User\\Downloads\\Iskotify Upgrades\\_extracted'
  const { headers, dataRows } = loadCSV(
    `${csvDir}\\Iskotify_Career_Destinations__PROGRAMS.csv`,
    'Program Name'
  )

  const tracker = makeNullTracker([
    'name', 'country_region', 'courses_covered', 'managing_body',
    'annual_slots', 'key_requirements', 'immigration_outcome', 'website', 'notes',
  ])

  const rows = []
  const seenIds = new Set()
  let skipped = 0

  for (const dataRow of dataRows) {
    const get = (col) => makeGet(headers, dataRow)(col)

    const name = get('Program Name').trim()
    if (!name) { skipped++; continue }

    const id = slugify(name)
    if (seenIds.has(id)) {
      console.warn(`  WARN: dup program id: ${id} (from "${name}")`)
      continue
    }
    seenIds.add(id)

    const country_region = resolveSentinel(get('Country/Region'))
    const courses_raw = get('Courses Covered')
    const courses_covered = splitComma(courses_raw)
    const managing_body = resolveSentinel(get('Managing Body'))
    const annual_slots = resolveSentinel(get('Annual Slots / Scale'))
    const key_requirements = resolveSentinel(get('Key Requirements'))
    const immigration_outcome = resolveSentinel(get('Immigration Outcome'))
    const website = resolveSentinel(get('Website'))
    const notes = resolveSentinel(get('Notes'))

    tracker.record('name', name)
    tracker.record('country_region', country_region)
    tracker.record('courses_covered', courses_covered.length ? courses_covered : null)
    tracker.record('managing_body', managing_body)
    tracker.record('annual_slots', annual_slots)
    tracker.record('key_requirements', key_requirements)
    tracker.record('immigration_outcome', immigration_outcome)
    tracker.record('website', website)
    tracker.record('notes', notes)

    const cc = sqlArray(courses_covered)

    rows.push(
      `INSERT INTO career_programs (id, name, country_region, courses_covered, managing_body, annual_slots, key_requirements, immigration_outcome, website, notes)\n` +
      `VALUES (${sqlStr(id)}, ${sqlStr(name)}, ${sqlStr(country_region)}, ${cc}, ${sqlStr(managing_body)}, ${sqlStr(annual_slots)}, ${sqlStr(key_requirements)}, ${sqlStr(immigration_outcome)}, ${sqlStr(website)}, ${sqlStr(notes)})\n` +
      `ON CONFLICT (id) DO UPDATE SET\n` +
      `  name = EXCLUDED.name,\n` +
      `  country_region = EXCLUDED.country_region,\n` +
      `  courses_covered = EXCLUDED.courses_covered,\n` +
      `  managing_body = EXCLUDED.managing_body,\n` +
      `  annual_slots = EXCLUDED.annual_slots,\n` +
      `  key_requirements = EXCLUDED.key_requirements,\n` +
      `  immigration_outcome = EXCLUDED.immigration_outcome,\n` +
      `  website = EXCLUDED.website,\n` +
      `  notes = EXCLUDED.notes;`
    )
  }

  console.log(`\n[career_programs] ${rows.length} rows (${skipped} skipped)`)
  console.log('Null rates:\n' + tracker.report())

  const sql =
    `-- career_programs seed (auto-generated by scripts/parse-career-structured.mjs)\n` +
    `-- Idempotent: INSERT … ON CONFLICT (id) DO UPDATE\n\n` +
    rows.join('\n\n') + '\n'

  return { sql, count: rows.length }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const seedDir = resolve(repoRoot, 'supabase', 'seed')
mkdirSync(seedDir, { recursive: true })

console.log('=== parse-career-structured.mjs ===\n')

const { sql: coursesSql, count: coursesCount } = buildCoursesSeed()
writeFileSync(resolve(seedDir, 'career_courses_seed.sql'), coursesSql, 'utf8')
console.log(`  → wrote supabase/seed/career_courses_seed.sql (${coursesCount} rows)`)

const { sql: destSql, count: destCount } = buildDestinationsSeed()
writeFileSync(resolve(seedDir, 'career_destinations_seed.sql'), destSql, 'utf8')
console.log(`  → wrote supabase/seed/career_destinations_seed.sql (${destCount} rows)`)

const { sql: countriesSql, count: countriesCount } = buildCountriesSeed()
writeFileSync(resolve(seedDir, 'career_countries_seed.sql'), countriesSql, 'utf8')
console.log(`  → wrote supabase/seed/career_countries_seed.sql (${countriesCount} rows)`)

const { sql: programsSql, count: programsCount } = buildProgramsSeed()
writeFileSync(resolve(seedDir, 'career_programs_seed.sql'), programsSql, 'utf8')
console.log(`  → wrote supabase/seed/career_programs_seed.sql (${programsCount} rows)`)

console.log('\n=== DONE ===')
console.log(`Total: ${coursesCount} courses, ${destCount} destinations, ${countriesCount} countries, ${programsCount} programs`)
