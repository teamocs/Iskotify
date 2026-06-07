#!/usr/bin/env node
// ETL: board-exam top-school rankings → course_school_rankings_seed.sql + bar_results_seed.sql
// Self-contained ESM. Run: node scripts/parse-rankings.mjs
//
// Sources: C:\Users\User\Downloads\Iskotify Upgrades\_extracted\
//   - ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__<Suffix>.csv  (29 board courses)
//   - ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__Bar.csv        (separate schema)
//
// Output: supabase/seed/course_school_rankings_seed.sql
//         supabase/seed/bar_results_seed.sql

import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const EXTRACTED_DIR = 'C:\\Users\\User\\Downloads\\Iskotify Upgrades\\_extracted'
const SEED_DIR = resolve(REPO_ROOT, 'supabase', 'seed')

// ---------------------------------------------------------------------------
// Reused: Quote-aware RFC4180 CSV parser (from import-upcat-questions.mjs)
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
// Reused helpers from scholarshipNormalize.mjs (inlined to keep ESM-self-contained)
// ---------------------------------------------------------------------------
const LATIN1_PAIRS = [
  [/â±/g, '₱'],
  [/â€"/g, '—'],
  [/â€–/g, '–'],
  [/â€™/g, '’'],
  [/â€˜/g, '‘'],
  [/â€œ/g, '“'],
  [/â€/g, '”'],
  [/�/g, '—'],
]
const MOJIBAKE_PAIRS = [
  [/â€"/g, '—'],
  [/â€–/g, '–'],
  [/â€™/g, '’'],
  [/â€˜/g, '‘'],
  [/â€œ/g, '“'],
  [/â€/g, '”'],
  [/Ã±/g, 'ñ'],
  [/Ã'/g, 'Ñ'],
  [/�/g, '—'],
]
function decodeMojibake(text) {
  let out = String(text ?? '')
  for (const [re, rep] of LATIN1_PAIRS) out = out.replace(re, rep)
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  // Handle replacement char variant from latin1-read files: "Ba?os" → "Baños"
  // The CSV may have literal '?' for ñ when read as ASCII
  // Pattern: Ba?os → Baños
  out = out.replace(/Ba\?os/g, 'Baños')
  // Also handle standalone ? that replaced special chars in known patterns
  // e.g. "Los Ba?os" is the most common; but we already handle it above.
  return out
}

const SENTINELS = new Set(['', 'unconfirmed', '[unconfirmed]', 'unknown', 'tba', 'verify', 'n/a', 'na', '—', '-', 'none', 'not applicable'])
function resolveSentinel(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  if (SENTINELS.has(trimmed.toLowerCase())) return null
  return trimmed || null
}

function slugify(name) {
  if (!name) return 'unknown'
  return decodeMojibake(name.trim())
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

const _REGION_MAP = {}
function _reg(canon, ...aliases) {
  for (const a of aliases) _REGION_MAP[a.toLowerCase()] = canon
}
_reg('NCR', 'NCR', 'National Capital Region', 'Metro Manila')
_reg('CAR', 'CAR', 'Cordillera Administrative Region')
_reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I', '1')
_reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II', '2')
_reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III', '3', 'Region 3')
_reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A', 'IVA', 'Region IV-A (CALABARZON)', '4-a', 'region 4a')
_reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B', 'IVB', 'Region IV-B (MIMAROPA)')
_reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V', '5')
_reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI', '6')
_reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII', '7')
_reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII', '8')
_reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX', '9')
_reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X', '10')
_reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI', '11')
_reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII', '12')
_reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'XIII', '13')
_reg('BARMM', 'BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao', 'ARMM')

function canonicalizeRegion(raw) {
  const key = (raw ?? '').trim().toLowerCase()
  return _REGION_MAP[key] ?? (raw ?? '').trim()
}

// ---------------------------------------------------------------------------
// Filename → course_tab mapping (MUST match course_taxonomy_map_seed.sql)
// ---------------------------------------------------------------------------
// Files we process as board exams (maps filename suffix → course_tab):
const FILENAME_TO_TAB = {
  'AGRI':     'AGRI',
  'CE':       'CE',
  'ChemE':    'ChemE',
  'CPA':      'CPA',
  'CRIM':     'CRIM',
  'Dent':     'DENT',
  'ECE':      'ECE',
  'EE-REE':   'REE',
  'FISH':     'FISH',
  'FoodTech': 'FOODTECH',
  'GE':       'GE',
  'GEO':      'GEO',
  'LET':      'LET',
  'MARINA':   'MARINA',
  'ME':       'ME',
  'MedTech':  'MEDTECH',
  'MetE':     'MetE',
  'MiningE':  'MiningE',
  'NLE':      'NLE',
  'OT':       'OT',
  'Pharmacy': 'PHARMA',
  'PLE':      'PLE',
  'PsychPsm': 'PSYCHOM',
  'PsychPsy': 'PSYCHO',
  'PT':       'PT',
  'RND':      'RND',
  'RTLE':     'RADTECH',
  'VetMed':   'VETMED',
  // ARCH not found as a file — skip if absent
  'ARCH':     'ARCH',
}

// Human-readable course names (derived from row-1 title in each file; fallback from key)
// We extract from the first row of the CSV automatically.

// ---------------------------------------------------------------------------
// SQL escaping
// ---------------------------------------------------------------------------
function esc(s) {
  if (s == null) return 'NULL'
  return "'" + String(s).replace(/'/g, "''") + "'"
}
function escNum(v) {
  if (v == null || v === '') return 'NULL'
  const n = parseFloat(String(v).replace(/%/g, '').trim())
  if (isNaN(n)) return 'NULL'
  return String(n)
}
function escInt(v) {
  if (v == null || v === '') return 'NULL'
  const n = parseInt(String(v).replace(/,/g, '').trim(), 10)
  if (isNaN(n)) return 'NULL'
  return String(n)
}

// ---------------------------------------------------------------------------
// Detect data start row: first row whose first non-empty cell parses as integer
// ---------------------------------------------------------------------------
function findDataStart(rows) {
  for (let i = 0; i < rows.length; i++) {
    const first = (rows[i][0] ?? '').trim()
    if (first !== '' && /^\d+$/.test(first)) return i
  }
  return -1
}

// ---------------------------------------------------------------------------
// Extract human-readable course title from row 0 of the file
// ---------------------------------------------------------------------------
function extractCourseTitle(rows) {
  // Row 0: "??  Civil Engineering … Top Schools (National Ranking),..."
  const raw = (rows[0]?.[0] ?? '').trim()
  // Strip emoji prefix (anything before the first letter group)
  // e.g. "??  Civil Engineering … Top Schools" → "Civil Engineering"
  // Pattern: strip leading non-alpha chars, then take text before '–' or 'Top Schools'
  const cleaned = raw.replace(/^[^A-Za-z]+/, '').trim()
  // Take up to ' – Top Schools' or ' Top Schools' or end
  const m = cleaned.match(/^(.*?)(?:\s*[–—]\s*Top Schools|\s+Top Schools)/i)
  if (m) return m[1].trim()
  return cleaned.replace(/,.*$/, '').trim() || 'Unknown'
}

// ---------------------------------------------------------------------------
// Parse a board exam file → array of row objects
// ---------------------------------------------------------------------------
function parseBoardFile(filePath, courseTab) {
  const raw = readFileSync(filePath, 'latin1') // latin1 to preserve raw bytes for mojibake
  const rows = parseCSV(raw)
  const courseTitle = extractCourseTitle(rows)
  const dataStart = findDataStart(rows)
  if (dataStart === -1) {
    console.warn(`  [WARN] No data rows found in ${filePath}`)
    return []
  }
  // Data header is just before dataStart (or we use positional cols)
  // Cols: Rank | School Name | Region | Province | Wilson Score | Raw Pass Rate | Total Examinees | Total Passers | Years With Data | # Exam Periods
  const results = []
  const usedIds = new Set()

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i]
    // Skip empty rows
    if (!r || r.length < 2) continue
    const rankRaw = (r[0] ?? '').trim()
    if (rankRaw === '' || !/^\d+$/.test(rankRaw)) continue

    const rank = parseInt(rankRaw, 10)
    const schoolNameRaw = decodeMojibake((r[1] ?? '').trim())
    if (!schoolNameRaw) {
      console.warn(`  [SKIP] Blank school name at rank ${rank} in ${basename(filePath)}`)
      continue
    }
    // Skip aggregate/header artifact rows (e.g. "2015/August/Passers" — looks like a date path, not a school)
    if (/^\d{4}\//.test(schoolNameRaw)) {
      console.warn(`  [SKIP] Aggregate row (not a school): "${schoolNameRaw}" at rank ${rank} in ${basename(filePath)}`)
      continue
    }
    const region = canonicalizeRegion(decodeMojibake((r[2] ?? '').trim()))
    const province = decodeMojibake((r[3] ?? '').trim()) || null
    const wilsonRaw = (r[4] ?? '').trim()
    const passRateRaw = (r[5] ?? '').trim()
    const totalExamineesRaw = (r[6] ?? '').trim()
    const totalPassersRaw = (r[7] ?? '').trim()
    const yearsWithData = decodeMojibake((r[8] ?? '').trim()) || null
    const examPeriodsRaw = (r[9] ?? '').trim()

    // Build unique id: courseTab-rank-slug
    const baseSlug = slugify(schoolNameRaw)
    let idCandidate = `${courseTab}-${rank}-${baseSlug}`
    // Ensure uniqueness (collision suffix)
    let suffix = 0
    let finalId = idCandidate
    while (usedIds.has(finalId)) {
      suffix++
      finalId = `${idCandidate}-${suffix}`
    }
    usedIds.add(finalId)

    results.push({
      id: finalId,
      course_tab: courseTab,
      course_name: courseTitle,
      rank,
      school_name: schoolNameRaw,
      region: region || null,
      province,
      wilson_score: wilsonRaw,
      raw_pass_rate: passRateRaw,
      total_examinees: totalExamineesRaw,
      total_passers: totalPassersRaw,
      years_with_data: yearsWithData,
      exam_periods: examPeriodsRaw,
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Parse the Bar file → array of row objects
// ---------------------------------------------------------------------------
function parseBarFile(filePath) {
  const raw = readFileSync(filePath, 'latin1')
  const rows = parseCSV(raw)
  // Schema: School Name | Region | Province | Year | Pass Rate % | National Avg % | SC Rank | Notes
  // Data header row is row 3 (0-indexed): "School Name,Region,Province,Year,Pass Rate %,National Avg %,SC Rank,Notes"
  // Detect: find first row where r[0].trim() matches 'school name' (case-insensitive) or first row where r[3] parses as 4-digit year
  let dataStart = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < 4) continue
    // Check if r[3] is a 4-digit year (data row)
    const maybeYear = (r[3] ?? '').trim()
    if (/^\d{4}$/.test(maybeYear)) {
      dataStart = i
      break
    }
  }
  if (dataStart === -1) {
    console.warn(`  [WARN] No data rows found in Bar file: ${filePath}`)
    return []
  }

  const results = []
  const usedIds = new Set()

  for (let i = dataStart; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < 4) continue
    const yearRaw = (r[3] ?? '').trim()
    if (!/^\d{4}$/.test(yearRaw)) continue

    const schoolNameRaw = decodeMojibake((r[0] ?? '').trim())
    if (!schoolNameRaw) {
      console.warn(`  [SKIP] Blank school name at year ${yearRaw} in Bar file`)
      continue
    }
    const region = canonicalizeRegion(decodeMojibake((r[1] ?? '').trim()))
    const province = decodeMojibake((r[2] ?? '').trim()) || null
    const year = parseInt(yearRaw, 10)
    const passRateRaw = (r[4] ?? '').trim()
    const nationalAvgRaw = (r[5] ?? '').trim()
    const scRankRaw = (r[6] ?? '').trim()
    const notes = decodeMojibake((r[7] ?? '').trim()) || null

    const baseSlug = slugify(schoolNameRaw)
    let idCandidate = `bar-${year}-${baseSlug}`
    let suffix = 0
    let finalId = idCandidate
    while (usedIds.has(finalId)) {
      suffix++
      finalId = `${idCandidate}-${suffix}`
    }
    usedIds.add(finalId)

    results.push({
      id: finalId,
      school_name: schoolNameRaw,
      region: region || null,
      province,
      year,
      pass_rate: passRateRaw,
      national_avg: nationalAvgRaw,
      sc_rank: scRankRaw,
      notes,
    })
  }
  return results
}

// ---------------------------------------------------------------------------
// Generate rankings SQL
// ---------------------------------------------------------------------------
function buildRankingsSql(allRows) {
  const lines = [
    '-- course_school_rankings seed (idempotent)',
    '-- Generated by scripts/parse-rankings.mjs',
    '-- DO NOT EDIT MANUALLY — regenerate via the ETL script.',
    '--',
    `-- Total rows: ${allRows.length}`,
    '',
    'INSERT INTO course_school_rankings (',
    '  id, course_tab, course_name, rank, school_name, region, province,',
    '  wilson_score, raw_pass_rate, total_examinees, total_passers,',
    '  years_with_data, exam_periods, tertiary_school_id',
    ') VALUES',
  ]

  const valueLines = allRows.map((row, idx) => {
    const comma = idx < allRows.length - 1 ? ',' : ''
    return `  (${esc(row.id)}, ${esc(row.course_tab)}, ${esc(row.course_name)}, ${row.rank}, ${esc(row.school_name)}, ${esc(row.region || null)}, ${esc(row.province)}, ${escNum(row.wilson_score)}, ${escNum(row.raw_pass_rate)}, ${escInt(row.total_examinees)}, ${escInt(row.total_passers)}, ${esc(row.years_with_data)}, ${escInt(row.exam_periods)}, NULL)${comma}`
  })

  lines.push(...valueLines)
  lines.push('ON CONFLICT (id) DO UPDATE SET')
  lines.push('  course_tab        = EXCLUDED.course_tab,')
  lines.push('  course_name       = EXCLUDED.course_name,')
  lines.push('  rank              = EXCLUDED.rank,')
  lines.push('  school_name       = EXCLUDED.school_name,')
  lines.push('  region            = EXCLUDED.region,')
  lines.push('  province          = EXCLUDED.province,')
  lines.push('  wilson_score      = EXCLUDED.wilson_score,')
  lines.push('  raw_pass_rate     = EXCLUDED.raw_pass_rate,')
  lines.push('  total_examinees   = EXCLUDED.total_examinees,')
  lines.push('  total_passers     = EXCLUDED.total_passers,')
  lines.push('  years_with_data   = EXCLUDED.years_with_data,')
  lines.push('  exam_periods      = EXCLUDED.exam_periods,')
  lines.push('  tertiary_school_id = EXCLUDED.tertiary_school_id;')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Generate bar_results SQL
// ---------------------------------------------------------------------------
function buildBarSql(allRows) {
  const lines = [
    '-- bar_results seed (idempotent)',
    '-- Generated by scripts/parse-rankings.mjs',
    '-- DO NOT EDIT MANUALLY — regenerate via the ETL script.',
    '--',
    `-- Total rows: ${allRows.length}`,
    '',
    'INSERT INTO bar_results (',
    '  id, school_name, region, province, year, pass_rate, national_avg, sc_rank, notes',
    ') VALUES',
  ]

  const valueLines = allRows.map((row, idx) => {
    const comma = idx < allRows.length - 1 ? ',' : ''
    return `  (${esc(row.id)}, ${esc(row.school_name)}, ${esc(row.region || null)}, ${esc(row.province)}, ${row.year}, ${escNum(row.pass_rate)}, ${escNum(row.national_avg)}, ${escInt(row.sc_rank)}, ${esc(row.notes)})${comma}`
  })

  lines.push(...valueLines)
  lines.push('ON CONFLICT (id) DO UPDATE SET')
  lines.push('  school_name   = EXCLUDED.school_name,')
  lines.push('  region        = EXCLUDED.region,')
  lines.push('  province      = EXCLUDED.province,')
  lines.push('  year          = EXCLUDED.year,')
  lines.push('  pass_rate     = EXCLUDED.pass_rate,')
  lines.push('  national_avg  = EXCLUDED.national_avg,')
  lines.push('  sc_rank       = EXCLUDED.sc_rank,')
  lines.push('  notes         = EXCLUDED.notes;')
  lines.push('')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  // List all ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__*.csv files
  const allFiles = readdirSync(EXTRACTED_DIR)
    .filter(f => f.startsWith('ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__') && f.endsWith('.csv'))
    .sort()

  console.log(`Found ${allFiles.length} TOP_SCHOOLS files.`)

  const allRankingRows = []
  let barRows = []

  const tabCounts = {}

  for (const filename of allFiles) {
    const filePath = resolve(EXTRACTED_DIR, filename)
    // Extract suffix: ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__<Suffix>.csv
    const suffix = filename.replace('ISKOTIFY_TOP_SCHOOLS_BY_COURSE_v5__', '').replace('.csv', '')

    // Skip INDEX
    if (suffix === 'INDEX') {
      console.log(`  [SKIP] ${filename} (index file)`)
      continue
    }

    // Bar file
    if (suffix === 'Bar') {
      console.log(`  [BAR]  ${filename}`)
      barRows = parseBarFile(filePath)
      console.log(`         → ${barRows.length} bar_results rows`)
      continue
    }

    // Check if this suffix is in our known board mapping
    const courseTab = FILENAME_TO_TAB[suffix]
    if (!courseTab) {
      console.log(`  [SKIP] ${filename} (suffix '${suffix}' not in taxonomy — non-board file)`)
      continue
    }

    console.log(`  [BOARD] ${filename} → ${courseTab}`)
    const rows = parseBoardFile(filePath, courseTab)
    console.log(`          → ${rows.length} rows`)
    tabCounts[courseTab] = rows.length
    allRankingRows.push(...rows)
  }

  // --- Dup ID check ---
  const seenIds = new Set()
  let dupCount = 0
  for (const row of allRankingRows) {
    if (seenIds.has(row.id)) {
      console.warn(`  [DUP] rankings id: ${row.id}`)
      dupCount++
    }
    seenIds.add(row.id)
  }
  const seenBarIds = new Set()
  let barDupCount = 0
  for (const row of barRows) {
    if (seenBarIds.has(row.id)) {
      console.warn(`  [DUP] bar id: ${row.id}`)
      barDupCount++
    }
    seenBarIds.add(row.id)
  }

  // --- Spot checks ---
  console.log('\n--- Spot checks ---')
  // CE top-3
  const ceRows = allRankingRows.filter(r => r.course_tab === 'CE').sort((a, b) => a.rank - b.rank)
  for (const r of ceRows.slice(0, 3)) {
    console.log(`  CE #${r.rank}: ${r.school_name} | region=${r.region} | wilson=${r.wilson_score} | province=${r.province}`)
  }
  // Los Baños ñ check
  const losbanosRows = allRankingRows.filter(r => r.school_name.includes('Los Ba'))
  for (const r of losbanosRows.slice(0, 3)) {
    console.log(`  ñ-check: ${r.school_name} (${r.course_tab})`)
  }

  // --- Write seeds ---
  const rankingsSql = buildRankingsSql(allRankingRows)
  const barSql = buildBarSql(barRows)

  const rankingsOut = resolve(SEED_DIR, 'course_school_rankings_seed.sql')
  const barOut = resolve(SEED_DIR, 'bar_results_seed.sql')

  writeFileSync(rankingsOut, rankingsSql, 'utf8')
  writeFileSync(barOut, barSql, 'utf8')

  // --- Summary ---
  console.log('\n=== SUMMARY ===')
  console.log(`Total ranking rows : ${allRankingRows.length}`)
  console.log(`Bar results rows   : ${barRows.length}`)
  console.log(`Dup ranking ids    : ${dupCount}`)
  console.log(`Dup bar ids        : ${barDupCount}`)
  console.log('\nPer-tab counts:')
  const sortedTabs = Object.entries(tabCounts).sort((a, b) => b[1] - a[1])
  for (const [tab, count] of sortedTabs) {
    console.log(`  ${tab.padEnd(10)} ${count}`)
  }
  console.log(`\nWrote: ${rankingsOut}`)
  console.log(`Wrote: ${barOut}`)
}

main()
