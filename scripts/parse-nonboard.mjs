#!/usr/bin/env node
// parse-nonboard.mjs — ETL for non-board school quality data
// Source: ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv (~1000 rows, ~670 empty xlsx artifacts)
// Output: supabase/seed/course_school_quality_seed.sql
// DO NOT apply directly; controller applies via supabase migration tooling.

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodeMojibake, resolveSentinel, slugify, canonicalizeRegion } from './scholarshipNormalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// --- RFC4180 quote-aware CSV parser (reused from import-upcat-questions.mjs) ---
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

// --- SQL escape helpers ---
function esc(s) {
  if (s == null) return 'NULL'
  return "'" + String(s).replace(/'/g, "''") + "'"
}

function escOrNull(s) {
  const v = resolveSentinel(decodeMojibake(s ?? ''))
  if (v == null) return 'NULL'
  return "'" + v.replace(/'/g, "''") + "'"
}

function boolOrNull(s) {
  if (s == null || s.trim() === '') return 'NULL'
  const lower = s.trim().toLowerCase()
  if (lower === 'true' || lower === '1' || lower === 'yes') return 'TRUE'
  if (lower === 'false' || lower === '0' || lower === 'no') return 'FALSE'
  return 'NULL'
}

function intOrNull(s) {
  if (s == null || s.trim() === '') return 'NULL'
  const v = resolveSentinel(s.trim())
  if (v == null) return 'NULL'
  const n = parseInt(v, 10)
  return isNaN(n) ? 'NULL' : String(n)
}

function pgArray(items) {
  if (!items || items.length === 0) return "'{}'"
  const escaped = items.map(i => i.replace(/'/g, "''").replace(/\\/g, '\\\\'))
  return "ARRAY[" + escaped.map(i => `'${i}'`).join(', ') + "]"
}

// --- ID slug helper (per-row school+course based) ---
function makeSlug(name) {
  return decodeMojibake((name ?? '').trim())
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// --- Read CSV ---
const csvPath = resolve('C:/Users/User/Downloads/Iskotify Upgrades/_extracted/ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv')
const raw = readFileSync(csvPath, 'utf8')
const table = parseCSV(raw)
const headerRaw = table[0]
const header = headerRaw.map(h => h.trim().toLowerCase())

const col = (cells, name) => {
  const idx = header.indexOf(name.toLowerCase())
  return idx >= 0 ? (cells[idx] ?? '').trim() : ''
}

// Filter to rows where School Name is non-empty
const dataRows = table.slice(1).filter(cells => {
  const schoolName = col(cells, 'school name')
  return schoolName.length > 0
})

console.error(`Total rows after header: ${table.length - 1}`)
console.error(`Rows with non-empty School Name: ${dataRows.length}`)

// --- Build rows + track IDs for collision handling ---
const usedIds = new Map()

function makeId(schoolName, courseStd) {
  const base = makeSlug(schoolName) + '-' + makeSlug(courseStd)
  const truncated = base.slice(0, 120)
  if (!usedIds.has(truncated)) {
    usedIds.set(truncated, 1)
    return truncated
  }
  const count = usedIds.get(truncated) + 1
  usedIds.set(truncated, count)
  return truncated + '-' + count
}

// --- Compose accreditations array ---
function buildAccreditations(cells) {
  const acc = []

  // Strip leading "Level " prefix so "Level IV" → "IV" for compact accreditation label
  const normLevel = (v) => v ? v.replace(/^level\s+/i, '') : v

  // PAASCU: Level + Year (+ Accreditor label)
  const paascuLevel = resolveSentinel(col(cells, 'paascu level'))
  const paascuYear = resolveSentinel(col(cells, 'paascu year'))
  if (paascuLevel) {
    const yr = paascuYear ? ` (${paascuYear.replace(/\.0$/, '')})` : ''
    acc.push(`PAASCU L${normLevel(paascuLevel)}${yr}`)
  }

  // AACCUP: Level + Year
  const aaccupLevel = resolveSentinel(col(cells, 'aaccup level'))
  const aaccupYear = resolveSentinel(col(cells, 'aaccup year'))
  if (aaccupLevel) {
    const yr = aaccupYear ? ` (${aaccupYear.replace(/\.0$/, '')})` : ''
    acc.push(`AACCUP L${normLevel(aaccupLevel)}${yr}`)
  }

  // PACUCOA: Level + Year
  const pacucoaLevel = resolveSentinel(col(cells, 'pacucoa level'))
  const pacucoaYear = resolveSentinel(col(cells, 'pacucoa year'))
  if (pacucoaLevel) {
    const yr = pacucoaYear ? ` (${pacucoaYear.replace(/\.0$/, '')})` : ''
    acc.push(`PACUCOA L${normLevel(pacucoaLevel)}${yr}`)
  }

  // ABET: Commission + Year
  const abetAccredited = resolveSentinel(col(cells, 'abet accredited'))
  const abetCommission = resolveSentinel(col(cells, 'abet commission'))
  const abetYear = resolveSentinel(col(cells, 'abet year'))
  if (abetAccredited && abetAccredited.toLowerCase() !== 'false') {
    const commission = abetCommission ? abetCommission : ''
    const yr = abetYear ? ` ${abetYear.replace(/\.0$/, '')}` : ''
    const inner = [commission, yr].filter(Boolean).join('')
    acc.push(inner ? `ABET (${inner.trim()})` : 'ABET')
  }

  // AACSB: Status + Year
  const aacsbStatus = resolveSentinel(col(cells, 'aacsb status'))
  const aacsbYear = resolveSentinel(col(cells, 'aacsb year'))
  if (aacsbStatus) {
    const yr = aacsbYear ? ` (${aacsbYear.replace(/\.0$/, '')})` : ''
    acc.push(`AACSB (${aacsbStatus}${yr})`)
  }

  // Other Quality Markers — only if non-sentinel and not a boolean artifact
  const otherRaw = decodeMojibake(col(cells, 'other quality markers'))
  const other = resolveSentinel(otherRaw)
  if (other && !['false', 'true', '0', '1'].includes(other.toLowerCase())) {
    acc.push(other)
  }

  return acc
}

// --- Compose ched_coe_cod ---
function buildChedCoeCod(cells) {
  const coe = resolveSentinel(col(cells, 'ched coe cod'))
  if (!coe || coe.toLowerCase() === 'false') return null
  const year = resolveSentinel(col(cells, 'ched designation year'))
  if (year) {
    const yr = year.replace(/\.0$/, '')
    return `${coe} (${yr})`
  }
  return coe
}

// --- Process rows ---
const sqlRows = []

for (const cells of dataRows) {
  const schoolName = decodeMojibake(col(cells, 'school name'))
  const regionCode = col(cells, 'region code')
  const regionName = col(cells, 'region name')

  // canonicalizeRegion: try region name first, fallback to code
  const regionRaw = regionName || regionCode
  const region = resolveSentinel(canonicalizeRegion(regionRaw))

  const province = escOrNull(decodeMojibake(col(cells, 'province')))
  const city = escOrNull(decodeMojibake(col(cells, 'city')))
  const courseStd = resolveSentinel(decodeMojibake(col(cells, 'course standardized')))
  const courseGroup = resolveSentinel(decodeMojibake(col(cells, 'course group')))
  const schoolType = resolveSentinel(decodeMojibake(col(cells, 'school type')))

  const chedCoeCod = buildChedCoeCod(cells)
  const qualityScore = intOrNull(col(cells, 'quality score'))
  const qualityTier = resolveSentinel(decodeMojibake(col(cells, 'quality tier')))
  const hasPrcBoard = boolOrNull(col(cells, 'has prc board'))
  const qsSubjectRank = escOrNull(col(cells, 'qs subject rank'))
  const dataConfidence = resolveSentinel(decodeMojibake(col(cells, 'data confidence')))

  const accreditations = buildAccreditations(cells)

  // id = slug(schoolName)-slug(course)
  const id = makeId(schoolName, courseStd ?? '')

  // school_name is NOT NULL — already filtered
  const schoolNameSql = "'" + schoolName.replace(/'/g, "''") + "'"

  sqlRows.push(`(
  ${esc(id)},
  ${schoolNameSql},
  ${escOrNull(region)},
  ${province},
  ${city},
  ${courseStd ? "'" + courseStd.replace(/'/g, "''") + "'" : 'NULL'},
  ${courseGroup ? "'" + courseGroup.replace(/'/g, "''") + "'" : 'NULL'},
  ${schoolType ? "'" + schoolType.replace(/'/g, "''") + "'" : 'NULL'},
  ${chedCoeCod ? "'" + chedCoeCod.replace(/'/g, "''") + "'" : 'NULL'},
  ${qualityScore},
  ${qualityTier ? "'" + qualityTier.replace(/'/g, "''") + "'" : 'NULL'},
  ${pgArray(accreditations)},
  ${hasPrcBoard},
  ${qsSubjectRank},
  ${dataConfidence ? "'" + dataConfidence.replace(/'/g, "''") + "'" : 'NULL'},
  NULL
)`)
}

// --- Stats for reporting ---
const courseGroupCounts = {}
const tierCounts = {}
let withAccreditations = 0

for (const cells of dataRows) {
  const cg = resolveSentinel(col(cells, 'course group')) ?? '(null)'
  courseGroupCounts[cg] = (courseGroupCounts[cg] ?? 0) + 1

  const qt = resolveSentinel(col(cells, 'quality tier')) ?? '(null)'
  // clean mojibake in tier names
  const qtClean = decodeMojibake(qt)
  tierCounts[qtClean] = (tierCounts[qtClean] ?? 0) + 1

  const acc = buildAccreditations(cells)
  if (acc.length > 0) withAccreditations++
}

console.error('\n--- Course Group Distribution ---')
for (const [k, v] of Object.entries(courseGroupCounts).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`)
}
console.error('\n--- Quality Tier Distribution ---')
for (const [k, v] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
  console.error(`  ${k}: ${v}`)
}
console.error(`\nRows with accreditations: ${withAccreditations} / ${dataRows.length}`)
console.error(`Unique IDs generated: ${usedIds.size}`)

// Check for duplicates (should be 0 since makeId handles collisions)
const dupIds = [...usedIds.entries()].filter(([, count]) => count > 1)
if (dupIds.length > 0) {
  console.error(`\nCollision IDs (handled with suffix): ${dupIds.length}`)
  for (const [id, count] of dupIds.slice(0, 5)) {
    console.error(`  ${id} → ${count} occurrences`)
  }
} else {
  console.error('No duplicate IDs.')
}

// --- Generate SQL ---
const outPath = resolve(repoRoot, 'supabase/seed/course_school_quality_seed.sql')

const sql = `-- course_school_quality_seed.sql
-- Source: ISKOTIFY_NON_BOARD_SCHOOLS__Master.csv
-- Generated: ${new Date().toISOString().slice(0, 10)} by scripts/parse-nonboard.mjs
-- Rows: ${sqlRows.length}
-- Idempotent: INSERT ... ON CONFLICT (id) DO UPDATE
-- DO NOT apply directly; controller applies via supabase migration tooling.

INSERT INTO course_school_quality (
  id, school_name, region, province, city,
  course_standardized, course_group, school_type, ched_coe_cod,
  quality_score, quality_tier, accreditations, has_prc_board,
  qs_subject_rank, data_confidence, tertiary_school_id
) VALUES
${sqlRows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  school_name       = EXCLUDED.school_name,
  region            = EXCLUDED.region,
  province          = EXCLUDED.province,
  city              = EXCLUDED.city,
  course_standardized = EXCLUDED.course_standardized,
  course_group      = EXCLUDED.course_group,
  school_type       = EXCLUDED.school_type,
  ched_coe_cod      = EXCLUDED.ched_coe_cod,
  quality_score     = EXCLUDED.quality_score,
  quality_tier      = EXCLUDED.quality_tier,
  accreditations    = EXCLUDED.accreditations,
  has_prc_board     = EXCLUDED.has_prc_board,
  qs_subject_rank   = EXCLUDED.qs_subject_rank,
  data_confidence   = EXCLUDED.data_confidence,
  tertiary_school_id = EXCLUDED.tertiary_school_id,
  updated_at        = now();
`

writeFileSync(outPath, sql, 'utf8')
console.error(`\nWrote ${sqlRows.length} rows → ${outPath}`)

// --- Exported row builder (for apply-schools.mjs) ---
// Builds JS row objects (not SQL strings) from the same source data.
// Uses a fresh ID counter so IDs match exactly what the SQL seed generates.
export function buildQuality() {
  const _usedIds = new Map()
  function _makeId(schoolName, courseStd) {
    const base = makeSlug(schoolName) + '-' + makeSlug(courseStd)
    const truncated = base.slice(0, 120)
    if (!_usedIds.has(truncated)) { _usedIds.set(truncated, 1); return truncated }
    const count = _usedIds.get(truncated) + 1
    _usedIds.set(truncated, count)
    return truncated + '-' + count
  }

  function _parseBool(s) {
    if (s == null || s.trim() === '') return null
    const lower = s.trim().toLowerCase()
    if (lower === 'true' || lower === '1' || lower === 'yes') return true
    if (lower === 'false' || lower === '0' || lower === 'no') return false
    return null
  }

  function _parseInt(s) {
    if (s == null || s.trim() === '') return null
    const v = resolveSentinel(s.trim())
    if (v == null) return null
    const n = parseInt(v, 10)
    return isNaN(n) ? null : n
  }

  return dataRows.map(cells => {
    const schoolName = decodeMojibake(col(cells, 'school name'))
    const regionCode = col(cells, 'region code')
    const regionName = col(cells, 'region name')
    const regionRaw = regionName || regionCode
    const region = resolveSentinel(canonicalizeRegion(regionRaw))
    const province = resolveSentinel(decodeMojibake(col(cells, 'province')))
    const city = resolveSentinel(decodeMojibake(col(cells, 'city')))
    const courseStd = resolveSentinel(decodeMojibake(col(cells, 'course standardized')))
    const courseGroup = resolveSentinel(decodeMojibake(col(cells, 'course group')))
    const schoolType = resolveSentinel(decodeMojibake(col(cells, 'school type')))
    const chedCoeCod = buildChedCoeCod(cells)
    const qualityScore = _parseInt(col(cells, 'quality score'))
    const qualityTier = resolveSentinel(decodeMojibake(col(cells, 'quality tier')))
    const hasPrcBoard = _parseBool(col(cells, 'has prc board'))
    const qsSubjectRank = resolveSentinel(col(cells, 'qs subject rank'))
    const dataConfidence = resolveSentinel(decodeMojibake(col(cells, 'data confidence')))
    const accreditations = buildAccreditations(cells)
    const id = _makeId(schoolName, courseStd ?? '')

    return {
      id,
      school_name: schoolName,
      region: region ?? null,
      province: province ?? null,
      city: city ?? null,
      course_standardized: courseStd ?? null,
      course_group: courseGroup ?? null,
      school_type: schoolType ?? null,
      ched_coe_cod: chedCoeCod ?? null,
      quality_score: qualityScore,
      quality_tier: qualityTier ?? null,
      accreditations,
      has_prc_board: hasPrcBoard,
      qs_subject_rank: qsSubjectRank ?? null,
      data_confidence: dataConfidence ?? null,
      tertiary_school_id: null,
    }
  })
}
