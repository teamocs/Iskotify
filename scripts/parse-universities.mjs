#!/usr/bin/env node
// parse-universities.mjs — ETL: merge two university CSVs into SQL seeds.
// Outputs:
//   supabase/seed/tertiary_schools_seed.sql   (tertiary_schools)
//   supabase/seed/university_profiles_seed.sql (university_profiles)
// Run: node scripts/parse-universities.mjs
// Self-contained ESM. Does NOT apply to DB.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ─── 1. RFC4180 quote-aware CSV parser (copied from import-upcat-questions.mjs) ───
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

// ─── 2. Normalization helpers (inline — mirrors scholarshipNormalize.mjs) ───
function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

const MOJIBAKE_PAIRS = [
  [/â€"/g, '—'], [/â€–/g, '–'], [/â€™/g, '’'], [/â€˜/g, '‘'],
  [/â€œ/g, '“'], [/â€/g, '”'], [/Ã±/g, 'ñ'], [/Ã'/g, 'Ñ'],
  [/�/g, '—'],
]
const LATIN1_PAIRS = [
  [/â±/g, '₱'], [/â€"/g, '—'], [/â€–/g, '–'], [/â€™/g, '’'],
  [/â€˜/g, '‘'], [/â€œ/g, '“'], [/â€/g, '”'], [/�/g, '—'],
]
function decodeMojibake(text) {
  let out = text
  for (const [re, rep] of LATIN1_PAIRS) out = out.replace(re, rep)
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  return out
}

const SENTINELS = new Set([
  '', 'unconfirmed', '[unconfirmed]', 'unknown', 'tba', 'verify',
  'n/a', 'na', '—', '-', 'none', 'not applicable',
])
function resolveSentinel(value) {
  if (value == null) return null
  let trimmed = value.trim()
  // starts with [UNCONFIRMED
  if (/^\[UNCONFIRM/i.test(trimmed)) return null
  // starts with UNCONFIRMED
  if (/^UNCONFIRM/i.test(trimmed)) return null
  // value contains [UNCONFIRMED...] inline — strip to null (field is unreliable)
  if (/\[UNCONFIRM/i.test(trimmed)) return null
  if (SENTINELS.has(trimmed.toLowerCase())) return null
  return trimmed || null
}

function slugify(name) {
  if (!name) return 'unknown'
  return decodeMojibake(name.trim())
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// ─── 3. Region canonicalizer (inline — mirrors scholarshipNormalize.mjs) ───
const _REGION_MAP = {}
function _reg(canon, ...aliases) {
  for (const a of aliases) _REGION_MAP[a.toLowerCase().trim()] = canon
}
_reg('NCR', 'NCR', 'National Capital Region', 'Metro Manila')
_reg('CAR', 'CAR', 'Cordillera Administrative Region')
_reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I', 'region 1')
_reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II', 'region 2')
_reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III', 'region 3')
_reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A', 'IVA', 'region 4-a', 'region iva')
_reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B', 'IVB', 'region 4-b', 'region ivb')
_reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V', 'region 5')
_reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI', 'region 6')
_reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII', 'region 7')
_reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII', 'region 8')
_reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX', 'region 9')
_reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X', 'region 10')
_reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI', 'region 11')
_reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII', 'region 12')
_reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'XIII', 'region 13')
_reg('BARMM', 'BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao', 'ARMM')

function canonicalizeRegion(raw) {
  if (!raw) return null
  const key = raw.trim().toLowerCase()
  const fallback = raw.trim()
  return _REGION_MAP[key] !== undefined ? _REGION_MAP[key] : (fallback || null)
}

// Also try partial match for compound region strings like "BARMM / Davao Occidental"
function canonicalizeRegionFuzzy(raw) {
  if (!raw) return null
  const direct = canonicalizeRegion(raw)
  if (direct !== raw.trim()) return direct // exact hit
  // Try each token
  const tokens = raw.split(/[/,;|]/).map(t => t.trim())
  for (const t of tokens) {
    const c = canonicalizeRegion(t)
    if (c !== t) return c
  }
  return resolveSentinel(raw)
}

// ─── 4. SQL helpers ───
function esc(v) {
  if (v === null || v === undefined) return 'NULL'
  return "'" + String(v).replace(/'/g, "''") + "'"
}
function escBool(v) {
  if (v === null || v === undefined) return 'NULL'
  return v ? 'TRUE' : 'FALSE'
}
function escInt(v) {
  if (v === null || v === undefined) return 'NULL'
  const n = parseInt(v, 10)
  return isNaN(n) ? 'NULL' : String(n)
}
function escArray(arr) {
  if (!arr || arr.length === 0) return "'{}'"
  const items = arr
    .filter(Boolean)
    .map(s => "'" + String(s).replace(/'/g, "''").replace(/\\/g, '\\\\') + "'")
  return items.length === 0 ? "'{}'" : 'ARRAY[' + items.join(',') + ']'
}

// ─── 5. Parse arrays from CSV cell (split on ; and ,, trim, dedupe, sentinel) ───
function parseArray(cell) {
  if (!cell) return []
  // strip surrounding brackets/quotes from Python list-like: ['a', 'b']
  let s = cell.trim()
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1)
  // split on semicolons first, then commas — but be smart about commas inside items
  // Strategy: split on semicolons to get major segments, then the segments themselves
  const segments = s.split(/;/)
  const out = []
  const seen = new Set()
  for (const seg of segments) {
    // Each segment may be 'item1, item2' or just 'item1'
    // Split further only if not surrounded by quotes
    const parts = seg.split(/,(?![^']*'[^']*$)/)
    for (const p of parts) {
      const cleaned = p.trim().replace(/^['"\[\]]+|['"\[\]]+$/g, '').trim()
      const resolved = resolveSentinel(cleaned)
      if (resolved && !seen.has(resolved.toLowerCase())) {
        seen.add(resolved.toLowerCase())
        out.push(resolved)
      }
    }
  }
  return out
}

// ─── 6. Determine is_suc / is_luc from type string ───
// These columns are NOT NULL DEFAULT false — unknown → false, never null.
function inferSuc(isSucCol, typeStr) {
  const suc = (isSucCol ?? '').trim().toUpperCase()
  if (suc === 'Y' || suc === 'YES' || suc === 'TRUE' || suc === '1') return true
  if (suc === 'N' || suc === 'NO' || suc === 'FALSE' || suc === '0') return false
  const t = (typeStr ?? '').toLowerCase()
  if (/state|suc|government/.test(t)) return true
  return false  // unknown → false (NOT NULL DEFAULT false)
}
function inferLuc(isLucCol, typeStr) {
  const luc = (isLucCol ?? '').trim().toUpperCase()
  if (luc === 'Y' || luc === 'YES' || luc === 'TRUE' || luc === '1') return true
  if (luc === 'N' || luc === 'NO' || luc === 'FALSE' || luc === '0') return false
  const t = (typeStr ?? '').toLowerCase()
  if (/local|luc/.test(t)) return true
  return false  // unknown → false (NOT NULL DEFAULT false)
}

// ─── 7. Free tuition inference ───
function inferFreeTuition(typeStr, tuitionRange, isSuc, isLuc) {
  const t = (tuitionRange ?? '').toLowerCase()
  if (/free|no tuition|ra 10931|ra10931/.test(t)) return true
  if (/\d[\d,]*/.test(t) && /peso|₱|p\s*\d/.test(t)) return false
  if (isSuc === true || isLuc === true) return true
  // Tuition range mentions numbers like "10,000" → paid
  if (/\b\d{4,}\b/.test(t)) return false
  return null
}

// ─── 8. Data confidence normalizer ───
function normalizeConfidence(raw) {
  if (!raw) return null
  const r = raw.trim().toUpperCase()
  if (r === 'HIGH') return 'HIGH'
  if (r === 'MEDIUM' || r === 'MED' || r === 'MODERATE') return 'MEDIUM'
  if (r === 'LOW-MEDIUM' || r === 'MEDIUM-LOW') return 'MEDIUM'
  if (r === 'LOW') return 'LOW'
  if (r === 'VERY LOW' || r === 'VERY_LOW' || r === 'VERYLOW') return 'VERY LOW'
  return null
}

// ─── 9. Normalize city for dedup key (strip parentheticals, take first segment) ───
function normCity(city) {
  if (!city) return ''
  return city.trim()
    .replace(/\s*\([^)]*\)/g, '') // strip " (parenthetical notes)"
    .split(/[;/]/)[0]              // take first segment at ; or /
    .split(',')[0]                 // take first comma segment
    .trim()
}

// ─── Build dedup key ───
function dedupKey(name, city) {
  const sn = slugify((name ?? '').trim())
  const sc = slugify(normCity(city ?? ''))
  return sn + '|' + sc
}

// ─── 10. Load CSVs ───
const MASTER_PATH = 'C:/Users/User/Downloads/Iskotify Upgrades/university_profiles_v2 - MASTER.csv'
const PROVINCE_PATH = 'C:/Users/User/Downloads/Iskotify Upgrades/universities_per_province - universities_per_province.csv.csv'

const masterRaw = readFileSync(MASTER_PATH, 'utf8')
const provinceRaw = readFileSync(PROVINCE_PATH, 'utf8')

const masterTable = parseCSV(masterRaw)
const provinceTable = parseCSV(provinceRaw)

function makeHeader(table) {
  return table[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
}
function makeRows(table, header) {
  return table.slice(1).map(cells => {
    const obj = {}
    header.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim() })
    return obj
  })
}

const masterHeader = makeHeader(masterTable)
const masterRows = makeRows(masterTable, masterHeader)
  .filter(r => r.school_name && r.school_name.trim() !== '')

const provinceHeader = makeHeader(provinceTable)
const provinceRows = makeRows(provinceTable, provinceHeader)
  .filter(r => r.university_name && r.university_name.trim() !== '')

console.log(`MASTER rows: ${masterRows.length}`)
console.log(`PROVINCE rows: ${provinceRows.length}`)

// ─── 11. Build tertiary_schools (dedup union) ───
// Map: dedupKey → school record
const schoolMap = new Map()   // key → school record
const keyToId = new Map()     // key → final id
const idUsed = new Set()      // track all assigned ids

function assignId(baseName) {
  const base = slugify(baseName)
  if (!idUsed.has(base)) { idUsed.add(base); return base }
  let suffix = 2
  while (idUsed.has(`${base}-${suffix}`)) suffix++
  const id = `${base}-${suffix}`
  idUsed.add(id)
  return id
}

let masterAddedCount = 0
let provinceAddedCount = 0
let mergedIntoExistingCount = 0

// Process MASTER first
for (const r of masterRows) {
  const name = r.school_name.trim()
  const city = r.city.trim()
  const key = dedupKey(name, city)

  if (!schoolMap.has(key)) {
    const id = assignId(name)
    keyToId.set(key, id)
    const region = canonicalizeRegionFuzzy(r.region_name)
    const typeStr = r.institution_type
    const isSuc = inferSuc(null, typeStr) // MASTER has no is_suc col
    const isLuc = inferLuc(null, typeStr)
    schoolMap.set(key, {
      id,
      name,
      acronym: resolveSentinel(r.common_acronym),
      region,
      province: resolveSentinel(r.province),
      city: resolveSentinel(normCity(city)),
      type: resolveSentinel(typeStr),
      is_suc: isSuc,
      is_luc: isLuc,
      rank_in_province: null,
      deped_school_id: null,
      _source: 'master',
    })
    masterAddedCount++
  }
}

// Process PROVINCE file — merge into existing or add new
for (const r of provinceRows) {
  const name = r.university_name.trim()
  const city = r.city_municipality.trim()
  const key = dedupKey(name, city)

  if (schoolMap.has(key)) {
    // Merge missing fields
    const existing = schoolMap.get(key)
    mergedIntoExistingCount++
    // Fill in is_suc/is_luc/rank/acronym if missing
    if (existing.is_suc === null) existing.is_suc = inferSuc(r.is_suc, r.university_type)
    if (existing.is_luc === null) existing.is_luc = inferLuc(r.is_luc, r.university_type)
    if (existing.rank_in_province === null) {
      const rank = parseInt(r.rank_in_province, 10)
      existing.rank_in_province = isNaN(rank) ? null : rank
    }
    if (!existing.acronym) existing.acronym = resolveSentinel(r.short_name)
    if (!existing.region) existing.region = canonicalizeRegionFuzzy(r.region || r.region_code)
    if (!existing.province) existing.province = resolveSentinel(r.province)
  } else {
    // New school from province file
    const id = assignId(name)
    keyToId.set(key, id)
    const region = canonicalizeRegionFuzzy(r.region || r.region_code)
    const typeStr = r.university_type
    const isSuc = inferSuc(r.is_suc, typeStr)
    const isLuc = inferLuc(r.is_luc, typeStr)
    const rank = parseInt(r.rank_in_province, 10)
    schoolMap.set(key, {
      id,
      name,
      acronym: resolveSentinel(r.short_name),
      region,
      province: resolveSentinel(r.province),
      city: resolveSentinel(normCity(city)),
      type: resolveSentinel(typeStr),
      is_suc: isSuc,
      is_luc: isLuc,
      rank_in_province: isNaN(rank) ? null : rank,
      deped_school_id: null,
      _source: 'province',
    })
    provinceAddedCount++
  }
}

const schools = [...schoolMap.values()]

// Coerce is_suc / is_luc: these are NOT NULL DEFAULT false — null must never reach the seed.
for (const s of schools) {
  if (s.is_suc !== true) s.is_suc = false
  if (s.is_luc !== true) s.is_luc = false
}

// Verify no duplicate ids
const idCounts = new Map()
for (const s of schools) idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1)
const dupIds = [...idCounts.entries()].filter(([, c]) => c > 1)
if (dupIds.length > 0) {
  console.error('DUPLICATE IDs:', dupIds.map(([id]) => id).join(', '))
  process.exit(1)
}

console.log(`\ntertiary_schools: ${schools.length} rows`)
console.log(`  from MASTER (new): ${masterAddedCount}`)
console.log(`  from PROVINCE (new): ${provinceAddedCount}`)
console.log(`  from PROVINCE (merged into existing): ${mergedIntoExistingCount}`)

// ─── 12. Build also a province-file lookup keyed by name for profiles enrichment ───
const provinceByKey = new Map()
for (const r of provinceRows) {
  const key = dedupKey(r.university_name, r.city_municipality)
  if (!provinceByKey.has(key)) provinceByKey.set(key, r)
}

// ─── 13. Build university_profiles (from MASTER) ───
// stat counters
let freeTuitionTrue = 0, freeTuitionFalse = 0, freeTuitionNull = 0
let profilesEmitted = 0, profilesSkipped = 0
let nullSchoolId = 0

const profileRows = []

for (const r of masterRows) {
  const name = r.school_name.trim()
  const city = r.city.trim()
  const key = dedupKey(name, city)
  const schoolId = keyToId.get(key)

  if (!schoolId) {
    nullSchoolId++
    profilesSkipped++
    continue
  }

  const school = schoolMap.get(key)

  // Look up province file for enrichment
  const prov = provinceByKey.get(key)

  // Text arrays
  const knownFor = parseArray(r.known_for_courses)
  const prcTop = parseArray(r.prc_top_courses)
  const coursesOffered = parseArray(r.courses_offered)
  const scholarshipsOffered = parseArray(r.scholarships_offered)
  const notablePrograms = prov ? parseArray(prov.notable_programs) : []
  const prcStrongBoards = prov ? parseArray(prov.prc_strong_boards) : []

  // Free tuition
  const ft = inferFreeTuition(r.institution_type, r.tuition_fee_range, school.is_suc, school.is_luc)
  if (ft === true) freeTuitionTrue++
  else if (ft === false) freeTuitionFalse++
  else freeTuitionNull++

  // Exam difficulty
  const examDiff = parseInt(r.exam_difficulty_1to5, 10)
  const examDiffVal = isNaN(examDiff) ? null : examDiff

  // Data confidence
  const conf = normalizeConfidence(resolveSentinel(r.data_confidence))

  profileRows.push({
    school_id: schoolId,
    data_tier: resolveSentinel(r.data_tier),
    entrance_exam_name: resolveSentinel(r.entrance_exam_name),
    entrance_exam_acronym: resolveSentinel(r.entrance_exam_acronym),
    testing_center_type: resolveSentinel(r.testing_center_type),
    application_open: resolveSentinel(r.application_open),
    application_close: resolveSentinel(r.application_close),
    exam_month: resolveSentinel(r.exam_month),
    estimated_passing_rate: resolveSentinel(r.estimated_passing_rate),
    estimated_slots: resolveSentinel(r.estimated_slots),
    tuition_fee_range: resolveSentinel(r.tuition_fee_range),
    academic_calendar: resolveSentinel(r.academic_calendar),
    website_url: resolveSentinel(r.website_url),
    application_portal_url: resolveSentinel(r.application_portal_url),
    facebook_url: resolveSentinel(r.facebook_url),
    ched_coe_cod: resolveSentinel(r.ched_coe_cod),
    accreditation: resolveSentinel(r.accreditation),
    year_established: (() => {
      const ye = resolveSentinel(r.year_established)
      if (!ye) return null
      const m = ye.match(/\b(1[5-9]\d\d|20[0-2]\d)\b/)
      return m ? m[1] : null
    })(),
    known_for_courses: knownFor,
    prc_top_courses: prcTop,
    courses_offered: coursesOffered,
    scholarships_offered: scholarshipsOffered,
    notable_programs: notablePrograms,
    prc_strong_boards: prcStrongBoards,
    free_tuition: ft,
    exam_difficulty: examDiffVal,
    data_confidence: conf,
  })
  profilesEmitted++
}

console.log(`\nuniversity_profiles: ${profilesEmitted} rows (skipped ${profilesSkipped} — no school_id match)`)
console.log(`free_tuition: TRUE=${freeTuitionTrue}, FALSE=${freeTuitionFalse}, NULL=${freeTuitionNull}`)

// ─── 14. Generate tertiary_schools SQL ───
// boolSql is used only for is_suc / is_luc (NOT NULL DEFAULT false).
// Unknown/null → 'FALSE' — never emit NULL for these columns.
function boolSql(v) {
  if (v === true) return 'TRUE'
  return 'FALSE'  // false or null/undefined → FALSE (column is NOT NULL DEFAULT false)
}

// boolOrNullSql is used for NULLABLE boolean columns (e.g. free_tuition).
// null/undefined → 'NULL' to preserve tri-state (unknown vs. known false).
function boolOrNullSql(v) {
  if (v === true) return 'TRUE'
  if (v === false) return 'FALSE'
  return 'NULL'
}

const schoolsCols = [
  'id', 'name', 'acronym', 'region', 'province', 'city',
  'type', 'is_suc', 'is_luc', 'rank_in_province', 'deped_school_id'
].join(', ')

const schoolsUpdateCols = [
  'name', 'acronym', 'region', 'province', 'city',
  'type', 'is_suc', 'is_luc', 'rank_in_province'
].map(c => `${c} = EXCLUDED.${c}`).join(',\n    ')

let schoolsSql = `-- tertiary_schools seed — generated by scripts/parse-universities.mjs
-- ${schools.length} rows; idempotent ON CONFLICT (id) DO UPDATE
-- DO NOT apply manually; used by migration/seed pipeline only.

INSERT INTO tertiary_schools (${schoolsCols})
VALUES\n`

schoolsSql += schools.map(s => {
  return `  (${[
    esc(s.id),
    esc(s.name),
    esc(s.acronym),
    esc(s.region),
    esc(s.province),
    esc(s.city),
    esc(s.type),
    boolSql(s.is_suc),
    boolSql(s.is_luc),
    escInt(s.rank_in_province),
    'NULL',   // deped_school_id always null
  ].join(', ')})`
}).join(',\n')

schoolsSql += `\nON CONFLICT (id) DO UPDATE SET
    ${schoolsUpdateCols};\n`

// ─── 15. Generate university_profiles SQL ───
const profilesCols = [
  'school_id', 'data_tier', 'entrance_exam_name', 'entrance_exam_acronym',
  'testing_center_type', 'application_open', 'application_close', 'exam_month',
  'estimated_passing_rate', 'estimated_slots', 'tuition_fee_range', 'academic_calendar',
  'website_url', 'application_portal_url', 'facebook_url', 'ched_coe_cod',
  'accreditation', 'year_established',
  'known_for_courses', 'prc_top_courses', 'courses_offered', 'scholarships_offered',
  'notable_programs', 'prc_strong_boards',
  'free_tuition', 'exam_difficulty', 'data_confidence',
].join(', ')

const profilesUpdateCols = [
  'data_tier', 'entrance_exam_name', 'entrance_exam_acronym',
  'testing_center_type', 'application_open', 'application_close', 'exam_month',
  'estimated_passing_rate', 'estimated_slots', 'tuition_fee_range', 'academic_calendar',
  'website_url', 'application_portal_url', 'facebook_url', 'ched_coe_cod',
  'accreditation', 'year_established',
  'known_for_courses', 'prc_top_courses', 'courses_offered', 'scholarships_offered',
  'notable_programs', 'prc_strong_boards',
  'free_tuition', 'exam_difficulty', 'data_confidence',
].map(c => `${c} = EXCLUDED.${c}`).join(',\n    ')

let profilesSql = `-- university_profiles seed — generated by scripts/parse-universities.mjs
-- ${profileRows.length} rows; idempotent ON CONFLICT (school_id) DO UPDATE
-- DO NOT apply manually; used by migration/seed pipeline only.

INSERT INTO university_profiles (${profilesCols})
VALUES\n`

profilesSql += profileRows.map(p => {
  return `  (${[
    esc(p.school_id),
    esc(p.data_tier),
    esc(p.entrance_exam_name),
    esc(p.entrance_exam_acronym),
    esc(p.testing_center_type),
    esc(p.application_open),
    esc(p.application_close),
    esc(p.exam_month),
    esc(p.estimated_passing_rate),
    esc(p.estimated_slots),
    esc(p.tuition_fee_range),
    esc(p.academic_calendar),
    esc(p.website_url),
    esc(p.application_portal_url),
    esc(p.facebook_url),
    esc(p.ched_coe_cod),
    esc(p.accreditation),
    esc(p.year_established),
    escArray(p.known_for_courses),
    escArray(p.prc_top_courses),
    escArray(p.courses_offered),
    escArray(p.scholarships_offered),
    escArray(p.notable_programs),
    escArray(p.prc_strong_boards),
    boolOrNullSql(p.free_tuition),
    escInt(p.exam_difficulty),
    esc(p.data_confidence),
  ].join(', ')})`
}).join(',\n')

profilesSql += `\nON CONFLICT (school_id) DO UPDATE SET
    ${profilesUpdateCols};\n`

// ─── 16. Write files ───
const seedDir = resolve(repoRoot, 'supabase/seed')
mkdirSync(seedDir, { recursive: true })

const schoolsPath = resolve(seedDir, 'tertiary_schools_seed.sql')
const profilesPath = resolve(seedDir, 'university_profiles_seed.sql')
writeFileSync(schoolsPath, schoolsSql, 'utf8')
writeFileSync(profilesPath, profilesSql, 'utf8')
console.log(`\nWrote: ${schoolsPath}`)
console.log(`Wrote: ${profilesPath}`)

// ─── 17. Spot checks ───
console.log('\n=== SPOT CHECKS ===')
// 1. A school in BOTH files: University of Santo Tomas
const ustKey = dedupKey('University of Santo Tomas', 'Manila')
const ust = schoolMap.get(ustKey)
console.log('UST (both files):', JSON.stringify(ust ?? 'NOT FOUND'))
const ustProfile = profileRows.find(p => p.school_id === ust?.id)
console.log('UST profile school_id:', ustProfile?.school_id ?? 'NO PROFILE (only in province file)')

// 2. UP Diliman
const updKey = dedupKey('University of the Philippines Diliman', 'Quezon City')
const upd = schoolMap.get(updKey)
console.log('UP Diliman:', JSON.stringify(upd ?? 'NOT FOUND'))

// 3. De La Salle University
const dlsuKey = dedupKey('De La Salle University', 'Manila')
const dlsu = schoolMap.get(dlsuKey)
console.log('DLSU:', JSON.stringify(dlsu ?? 'NOT FOUND'))

// 4. Basilan State College (MASTER only, BARMM)
const bscKey = dedupKey('Basilan State College', 'Isabela City, Basilan')
const bsc = schoolMap.get(bscKey)
console.log('Basilan State College:', JSON.stringify(bsc ?? 'NOT FOUND (try alt key)'))

// 5. PUP (in province file)
const pupKey = dedupKey('Polytechnic University of the Philippines', 'Manila')
const pup = schoolMap.get(pupKey)
console.log('PUP:', JSON.stringify(pup ?? 'NOT FOUND'))

// ─── 18. Integrity checks ───
console.log('\n=== INTEGRITY ===')
// school_id integrity: every profile.school_id must exist in schools
const schoolIdSet = new Set(schools.map(s => s.id))
const orphanProfiles = profileRows.filter(p => !schoolIdSet.has(p.school_id))
console.log(`Orphaned profiles (school_id not in tertiary_schools): ${orphanProfiles.length}`)
if (orphanProfiles.length > 0) {
  console.log('  First 5:', orphanProfiles.slice(0, 5).map(p => p.school_id))
}

// ID uniqueness
console.log(`Unique school IDs: ${schoolIdSet.size} (total rows: ${schools.length}) — ${schoolIdSet.size === schools.length ? 'OK (no dups)' : 'MISMATCH'}`)

// Null-rate on key fields
const nullRegion = schools.filter(s => !s.region).length
const nullProvince = schools.filter(s => !s.province).length
const nullCity = schools.filter(s => !s.city).length
const nullAcronym = schools.filter(s => !s.acronym).length
console.log(`NULL rates — region: ${nullRegion}/${schools.length}, province: ${nullProvince}/${schools.length}, city: ${nullCity}/${schools.length}, acronym: ${nullAcronym}/${schools.length}`)
console.log(`is_suc TRUE: ${schools.filter(s=>s.is_suc===true).length}, FALSE: ${schools.filter(s=>s.is_suc===false).length}, NULL: ${schools.filter(s=>s.is_suc===null).length}`)

// ─── Exported row builders (for apply-schools.mjs) ───
// schools / profileRows are already built at module load time above.
export function buildTertiarySchools() {
  return schools.map(s => ({
    id: s.id,
    name: s.name,
    acronym: s.acronym ?? null,
    region: s.region ?? null,
    province: s.province ?? null,
    city: s.city ?? null,
    type: s.type ?? null,
    is_suc: s.is_suc,
    is_luc: s.is_luc,
    rank_in_province: s.rank_in_province ?? null,
    deped_school_id: s.deped_school_id ?? null,
  }))
}

export function buildUniversityProfiles() {
  return profileRows.map(p => ({
    school_id: p.school_id,
    data_tier: p.data_tier ?? null,
    entrance_exam_name: p.entrance_exam_name ?? null,
    entrance_exam_acronym: p.entrance_exam_acronym ?? null,
    testing_center_type: p.testing_center_type ?? null,
    application_open: p.application_open ?? null,
    application_close: p.application_close ?? null,
    exam_month: p.exam_month ?? null,
    estimated_passing_rate: p.estimated_passing_rate ?? null,
    estimated_slots: p.estimated_slots ?? null,
    tuition_fee_range: p.tuition_fee_range ?? null,
    academic_calendar: p.academic_calendar ?? null,
    website_url: p.website_url ?? null,
    application_portal_url: p.application_portal_url ?? null,
    facebook_url: p.facebook_url ?? null,
    ched_coe_cod: p.ched_coe_cod ?? null,
    accreditation: p.accreditation ?? null,
    year_established: p.year_established ?? null,
    known_for_courses: p.known_for_courses ?? [],
    prc_top_courses: p.prc_top_courses ?? [],
    courses_offered: p.courses_offered ?? [],
    scholarships_offered: p.scholarships_offered ?? [],
    notable_programs: p.notable_programs ?? [],
    prc_strong_boards: p.prc_strong_boards ?? [],
    free_tuition: p.free_tuition ?? null,
    exam_difficulty: p.exam_difficulty ?? null,
    data_confidence: p.data_confidence ?? null,
  }))
}
