#!/usr/bin/env node
/**
 * parse-lgu-scholarships.mjs
 * Converts lgu_political_scholarships.txt -> supabase/seed/scholarships_lgu_seed.sql
 * Idempotent: INSERT ... ON CONFLICT (slug) DO UPDATE
 * Self-contained ESM (no external deps). Modelled on scripts/import-upcat-questions.mjs
 *
 * Usage: node scripts/parse-lgu-scholarships.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// ---- Normalization helpers (inlined from apps/admin/lib/csv/cleaners.ts) -----

function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

/**
 * Decode Windows-1252 mojibake glyph sequences.
 * The source file is UTF-8. We use Unicode escape sequences in regex patterns
 * so that this .mjs file itself stays unambiguously ASCII-safe.
 *
 * The mojibake sequences arise when Windows-1252 bytes are naively read as
 * ISO-8859-1 strings in JS.  The actual characters we look for:
 *   â€“  -> em dash U+2014  (---)
 *   â€–  -> en dash U+2013  (--)
 *   â€™  -> right single quote U+2019  (')
 *   â€˜  -> left single quote U+2018   (')
 *   â€œ  -> left double quote U+201c   (")
 *   â€  -> right double quote U+201d  (")
 *   Ã±        -> n-tilde U+00f1 (n with tilde)
 *   Ã’        -> N-tilde U+00d1
 * All expressed as raw code points that appear in the JS string.
 */
const MOJIBAKE_PAIRS = [
  // em dash: the three-char sequence that represents U+2014 when misread
  [new RegExp('â€“', 'g'), '—'],
  // en dash
  [new RegExp('â€–', 'g'), '–'],
  // right single quote
  [new RegExp('â€™', 'g'), '’'],
  // left single quote
  [new RegExp('â€˜', 'g'), '‘'],
  // left double quote
  [new RegExp('â€œ', 'g'), '“'],
  // right double quote (two variants)
  [new RegExp('â€', 'g'), '”'],
  [new RegExp('â€', 'g'), '”'],
  // n-tilde
  [new RegExp('Ã±', 'g'), 'ñ'],
  // N-tilde
  [new RegExp('Ã’', 'g'), 'Ñ'],
  // a-acute
  [new RegExp('Ã¡', 'g'), 'á'],
  // e-acute
  [new RegExp('Ã©', 'g'), 'é'],
  // o-acute
  [new RegExp('Ã³', 'g'), 'ó'],
  // replacement char -> em dash fallback
  [/�/g, '—'],
]

function decodeMojibake(text) {
  let out = text
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  return out
}

const SENTINELS = new Set([
  '', 'unknown', 'unverified', 'n/a', 'na', 'tba', 'tbc',
  'to be confirmed', 'to be announced', '—', '-', '[unconfirmed]',
  'none specified', 'none', 'none found', 'not found', 'not specified',
])

function resolveSentinel(value) {
  if (value == null) return null
  const trimmed = value.trim()
  return SENTINELS.has(trimmed.toLowerCase()) ? null : trimmed || null
}

// ---- Region canonicalization (mirrors apps/admin/lib/csv/cleaners.ts) --------

const REGION_MAP = {}
function reg(canon, ...aliases) {
  for (const a of aliases) REGION_MAP[a.toLowerCase()] = canon
}

reg('NCR', 'NCR', 'National Capital Region', 'Metro Manila', 'ncr')
reg('CAR', 'CAR', 'Cordillera Administrative Region', 'car')
reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I', 'region i')
reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II', 'region ii')
reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III', 'region iii')
reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A',
  'Region IV-A (CALABARZON)', 'region iv-a', 'region iv-a (calabarzon)')
reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B',
  'Region IV-B (MIMAROPA)', 'region iv-b', 'region iv-b (mimaropa)')
reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V', 'region v', 'region v (bicol)')
reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI',
  'region vi', 'region vi (western visayas)')
reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII',
  'region vii', 'region vii (central visayas)')
reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII',
  'region viii', 'region viii (eastern visayas)')
reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX',
  'region ix', 'region ix (zamboanga peninsula)')
reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X',
  'region x', 'region x (northern mindanao)')
reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI',
  'region xi', 'region xi (davao region)')
reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII',
  'region xii', 'region xii (soccsksargen)')
reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'CARAGA', 'XIII',
  'region xiii', 'region xiii (caraga)')
reg('BARMM', 'BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao',
  'ARMM', 'barmm')

function canonicalizeRegion(raw) {
  if (!raw) return ''
  const cleaned = raw.trim()
  // First try exact match
  const key = cleaned.toLowerCase()
  if (REGION_MAP[key]) return REGION_MAP[key]
  // If the region field has a note/parenthetical, strip it and try again
  // e.g. "Region XII (Note: Cotabato City is ...)" -> "Region XII"
  const stripped = cleaned.replace(/\s*\(.*\)/, '').trim()
  const keyStripped = stripped.toLowerCase()
  if (REGION_MAP[keyStripped]) return REGION_MAP[keyStripped]
  // Prefix match: try each known alias
  for (const [alias, canon] of Object.entries(REGION_MAP)) {
    if (key.startsWith(alias)) return canon
  }
  return cleaned
}

// ---- Currency parser ---------------------------------------------------------

/**
 * normalizeCurrency: extract a clear monthly amount from benefits text.
 * Returns a number (PHP) or null if no unambiguous monthly amount.
 * Conservative: only emits a value if 'month' is mentioned explicitly
 * with a single parseable peso amount.
 * Handles both U+20B1 peso sign and common variants.
 */
function normalizeCurrency(text) {
  if (!text) return null
  // U+20B1 is the Philippine Peso sign
  const monthlyPattern = /₱\s*([\d,]+)(?:\s*\/\s*month|\s+per\s+month|\s*monthly)/i
  const m = text.match(monthlyPattern)
  if (m) {
    const val = parseFloat(m[1].replace(/,/g, ''))
    if (!isNaN(val) && val > 0) return val
  }
  return null
}

/**
 * parsePercent: parse GWA as a numeric percentage.
 * Returns null if the value is a 1.0-5.0 grade (PH university scale),
 * a sentinel, or if there is no explicit percentage at all.
 * Extracts from strings like "Minimum average of 80%", "GWA of 90% or higher".
 */
function parsePercent(text) {
  if (!text) return null
  const t = text.trim()
  if (SENTINELS.has(t.toLowerCase())) return null
  // look for explicit percentage like "90%" or "minimum 85%"
  const pctMatch = t.match(/(\d+(?:\.\d+)?)\s*%/)
  if (pctMatch) {
    const val = parseFloat(pctMatch[1])
    if (!isNaN(val) && val > 0 && val <= 100) return val
  }
  // If value is on 1.0-5.0 scale (PH university notation), return null as instructed
  const gradeMatch = t.match(/^(?:GWA\s+of\s+)?(\d+\.\d+)/)
  if (gradeMatch) {
    const val = parseFloat(gradeMatch[1])
    if (val >= 1.0 && val <= 5.0) return null  // PH grade scale, skip
  }
  return null
}

// ---- SQL escaping helpers ----------------------------------------------------

function sqlStr(v) {
  if (v == null) return 'NULL'
  return `'${String(v).replace(/'/g, "''")}'`
}

function sqlBool(v) {
  return v ? 'TRUE' : 'FALSE'
}

function sqlNum(v) {
  if (v == null) return 'NULL'
  return String(v)
}

function sqlArray(arr) {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]'
  return `ARRAY[${arr.map(sqlStr).join(', ')}]`
}

function sqlJsonb(obj) {
  if (!obj || Object.keys(obj).length === 0) return "'{}'::jsonb"
  return `${sqlStr(JSON.stringify(obj))}::jsonb`
}

// ---- File parsing ------------------------------------------------------------

const SRC_PATH = 'C:/Users/User/Downloads/Iskotify Upgrades/_extracted/lgu_political_scholarships.txt'

// The file is UTF-8. Read as utf8 then apply targeted mojibake cleanup.
let rawText = readFileSync(SRC_PATH, 'utf8')
rawText = stripBom(rawText)
rawText = decodeMojibake(rawText)

// ---- Block splitter ----------------------------------------------------------

/**
 * Split raw text into blocks, one per "Scholarship ID:" occurrence.
 */
function splitBlocks(text) {
  const lines = text.split(/\r?\n/)
  const blocks = []
  let current = null

  for (const line of lines) {
    const idMatch = line.match(/^Scholarship ID:\s*(.+)/)
    if (idMatch) {
      if (current) blocks.push(current)
      current = { id: idMatch[1].trim(), lines: [line] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  if (current) blocks.push(current)

  return blocks
}

/**
 * Extract a field value from a block's lines.
 */
function extractField(lines, ...fieldNames) {
  for (const fieldName of fieldNames) {
    const pattern = new RegExp('^' + fieldName + ':\\s*(.*)', 'i')
    for (const line of lines) {
      const m = line.match(pattern)
      if (m) return m[1].trim()
    }
  }
  return null
}

const KNOWN_FIELDS = [
  'Full Name', 'Scholarship ID', 'Administering Body', 'Region', 'Province',
  'Province/City', 'Type', 'Status', 'Benefits', 'GWA Requirement',
  'Residency Requirement', 'Income Requirement', 'Course Restrictions',
  'Slots', 'Application Period', 'Contact/Source', 'Notes',
]

function extractMultilineField(lines, fieldName) {
  const startPattern = new RegExp('^' + fieldName + ':\\s*(.*)', 'i')
  let collecting = false
  const result = []
  for (const line of lines) {
    if (!collecting) {
      const m = line.match(startPattern)
      if (m) {
        collecting = true
        if (m[1].trim()) result.push(m[1].trim())
      }
    } else {
      // Stop at next known field OR a blank line (title of next entry bleeds in)
      if (!line.trim()) break
      const isNextField = KNOWN_FIELDS.some(f => line.match(new RegExp('^' + f + ':\\s*', 'i')))
      if (isNextField) break
      result.push(line.trim())
    }
  }
  return result.join(' ').trim() || null
}

// ---- Parse each block into a scholarship record ------------------------------

function parseBlock(block) {
  const { id, lines } = block

  // Strip any trailing note from ID (e.g. "(Note: Ilocos Norte is Region I; see below)")
  const rawId = id.replace(/\s*\(Note:.*?\)/, '').trim()
  const slug = rawId.toLowerCase()

  const fullName = extractField(lines, 'Full Name')
  const adminBody = extractField(lines, 'Administering Body')
  const regionRaw = extractField(lines, 'Region')
  const provinceRaw = extractField(lines, 'Province', 'Province/City')
  const typeRaw = extractField(lines, 'Type')
  const statusRaw = extractField(lines, 'Status')
  const benefitsRaw = extractMultilineField(lines, 'Benefits')
  const gwaRaw = extractField(lines, 'GWA Requirement')
  const residencyRaw = extractField(lines, 'Residency Requirement')
  const incomeRaw = extractField(lines, 'Income Requirement')
  const courseRaw = extractField(lines, 'Course Restrictions')
  const slotsRaw = extractField(lines, 'Slots')
  const appPeriodRaw = extractField(lines, 'Application Period')
  const sourceRaw = extractField(lines, 'Contact/Source')
  const notesRaw = extractMultilineField(lines, 'Notes')

  // Title and provider
  const title = fullName || rawId
  const provider = adminBody || ''

  // Region
  const region = canonicalizeRegion(regionRaw || '')

  // Scope and province/city
  const isCityProgram = /city government/i.test(typeRaw || '')
    || /City Government/i.test(adminBody || '')

  let province = null
  let city = null
  let scope = 'provincial'

  if (isCityProgram) {
    scope = 'city'
    const provCity = provinceRaw || ''
    // City name: strip parentheticals
    city = provCity.replace(/\s*\([^)]*\)/, '').trim() || null
    // Parent province from parenthetical (e.g. "Legazpi City (Albay)")
    const parenMatch = provCity.match(/\(([^)]+)\)/)
    if (parenMatch) {
      const inner = parenMatch[1].trim()
      // Exclude region codes, "capital", "area", "note" descriptors
      if (!inner.match(/^Region|^NCR|^CAR|^BARMM/i) && !/capital|area|note/i.test(inner)) {
        province = inner
      }
    }
  } else {
    province = resolveSentinel(provinceRaw)
    // Clean parentheticals from province (e.g. "Cotabato (North Cotabato)" -> "Cotabato")
    if (province) province = province.replace(/\s*\([^)]*\)/, '').trim() || null
  }

  // is_verified
  const statusNorm = (statusRaw || '').toLowerCase()
  const isVerified = /\bactive\b/i.test(statusNorm) && !/unverified/i.test(statusNorm)

  // external_url: first URL from Contact/Source
  let externalUrl = ''
  if (sourceRaw) {
    const urlMatch = sourceRaw.match(/https?:\/\/[^\s|,)]+/)
    if (urlMatch) externalUrl = urlMatch[0].trim().replace(/[,.)]+$/, '')
  }

  // gwa_requirement: parsePercent (null if PH 1.0-5.0 scale or ambiguous)
  const gwaRequirement = parsePercent(gwaRaw)

  // monthly_stipend: normalizeCurrency
  const monthlyStipend = normalizeCurrency(benefitsRaw)

  // income_ceiling: null (LGU income is free-text -> meta)
  const incomeCeiling = null

  // service_obligation_years: null (not stated for LGUs)
  const serviceObligationYears = null

  // requirements and target_year_levels: empty (no structured list in file)
  const requirements = []
  const targetYearLevels = []

  // scholarship_meta
  const meta = {}

  const benefitsText = resolveSentinel(benefitsRaw)
  if (benefitsText) meta.benefits_text = benefitsText

  const incomeText = resolveSentinel(incomeRaw)
  if (incomeText) meta.income_requirement_text = incomeText

  meta.residency_required = true

  const courseText = resolveSentinel(courseRaw)
  if (courseText) meta.course_restrictions = courseText

  const slotsText = resolveSentinel(slotsRaw)
  if (slotsText) meta.slots = slotsText

  const appText = resolveSentinel(appPeriodRaw)
  if (appText) meta.application_period = appText

  const notesText = resolveSentinel(notesRaw)
  if (notesText) meta.notes = notesText

  if (sourceRaw) meta.source = sourceRaw

  // huc_excluded: true for provincial programs (HUCs must use their city program)
  if (scope === 'provincial') meta.huc_excluded = true

  return {
    slug,
    title,
    provider,
    region,
    province,
    city,
    scope,
    is_verified: isVerified,
    external_url: externalUrl,
    gwa_requirement: gwaRequirement,
    monthly_stipend: monthlyStipend,
    income_ceiling: incomeCeiling,
    service_obligation_years: serviceObligationYears,
    requirements,
    target_year_levels: targetYearLevels,
    scholarship_meta: meta,
    // raw for spot-check reporting only
    _status_raw: statusRaw,
    _gwa_raw: gwaRaw,
    _benefits_raw: benefitsRaw,
    _id_raw: rawId,
  }
}

// ---- Main -------------------------------------------------------------------

const blocks = splitBlocks(rawText)

// Filter: remove the placeholder duplicate at top of file (has "(Note:" in ID)
const filteredBlocks = blocks.filter(b => !/\(Note:/i.test(b.id))

const scholarships = filteredBlocks.map(parseBlock)

// ---- Duplicate slug resolution -----------------------------------------------
// The source file has two entries with LGU-R12-COT-001:
//   1. Cotabato Province (Provincial) -> keep lgu-r12-cot-001
//   2. Cotabato City (City) -> rename to lgu-r12-cotc-001

const seen = new Set()
const uniqueScholarships = []
for (const s of scholarships) {
  if (!seen.has(s.slug)) {
    seen.add(s.slug)
    uniqueScholarships.push(s)
  } else {
    // Resolve: city programs get a 'c' suffix
    const suffix = s.scope === 'city' ? 'c' : 'b'
    let newSlug = s.slug + suffix
    while (seen.has(newSlug)) newSlug += 'x'
    console.warn(`Slug conflict: ${s.slug} -> renaming to ${newSlug} (${s.title})`)
    seen.add(newSlug)
    uniqueScholarships.push({ ...s, slug: newSlug })
  }
}

// ---- Statistics --------------------------------------------------------------

const total = uniqueScholarships.length
const verified = uniqueScholarships.filter(s => s.is_verified).length
const unverified = total - verified

const provinceCounts = {}
for (const s of uniqueScholarships) {
  const key = s.province || s.city || '(unknown)'
  provinceCounts[key] = (provinceCounts[key] || 0) + 1
}

function nullRate(field) {
  const nulls = uniqueScholarships.filter(s => s[field] == null).length
  return `${nulls}/${total} null (${((nulls / total) * 100).toFixed(0)}%)`
}

console.log('\n=== LGU Scholarship Parse Stats ===')
console.log(`Total entries: ${total}`)
console.log(`Verified/active: ${verified}`)
console.log(`Unverified: ${unverified}`)
console.log('\nPer-province counts (sample, top 15 by name):')
const sortedProvinces = Object.entries(provinceCounts).sort(([a], [b]) => a.localeCompare(b))
sortedProvinces.slice(0, 15).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
if (sortedProvinces.length > 15) console.log(`  ... and ${sortedProvinces.length - 15} more`)

console.log('\nNull rates for typed fields:')
console.log(`  gwa_requirement:          ${nullRate('gwa_requirement')}`)
console.log(`  monthly_stipend:          ${nullRate('monthly_stipend')}`)
console.log(`  income_ceiling:           ${nullRate('income_ceiling')}`)
console.log(`  service_obligation_years: ${nullRate('service_obligation_years')}`)

// ---- Spot check --------------------------------------------------------------

console.log('\n=== Spot Check (5 entries) ===')

const spot = (slug) => uniqueScholarships.find(s => s.slug === slug)

const isip = spot('lgu-r6-ilo-001')
console.log('\n[1] lgu-r6-ilo-001 (Iloilo ISIP - active, monthly stipend):')
console.log(`  title:           ${isip?.title}`)
console.log(`  region:          ${isip?.region}`)
console.log(`  scope:           ${isip?.scope}`)
console.log(`  is_verified:     ${isip?.is_verified}`)
console.log(`  gwa_requirement: ${isip?.gwa_requirement}`)
console.log(`  monthly_stipend: ${isip?.monthly_stipend}`)
console.log(`  benefits_snippet:${(isip?._benefits_raw || '').slice(0, 60)}`)

const cag = spot('lgu-r2-cag-001')
console.log('\n[2] lgu-r2-cag-001 (Cagayan - unverified):')
console.log(`  title:           ${cag?.title}`)
console.log(`  is_verified:     ${cag?.is_verified}`)
console.log(`  monthly_stipend: ${cag?.monthly_stipend}`)
console.log(`  gwa_requirement: ${cag?.gwa_requirement}`)

const qcsp = spot('lgu-ncr-qc-001')
console.log('\n[3] lgu-ncr-qc-001 (Quezon City - city program):')
console.log(`  title:           ${qcsp?.title}`)
console.log(`  scope:           ${qcsp?.scope}`)
console.log(`  city:            ${qcsp?.city}`)
console.log(`  province:        ${qcsp?.province}`)
console.log(`  is_verified:     ${qcsp?.is_verified}`)
console.log(`  huc_excluded:    ${qcsp?.scholarship_meta?.huc_excluded ?? false}`)

const bacolod = spot('lgu-r6-bacc-001')
console.log('\n[4] lgu-r6-bacc-001 (Bacolod City - city, has stipend):')
console.log(`  title:           ${bacolod?.title}`)
console.log(`  scope:           ${bacolod?.scope}`)
console.log(`  city:            ${bacolod?.city}`)
console.log(`  is_verified:     ${bacolod?.is_verified}`)
console.log(`  monthly_stipend: ${bacolod?.monthly_stipend}`)
console.log(`  benefits_snippet:${(bacolod?._benefits_raw || '').slice(0, 60)}`)

const nosp = spot('lgu-r6-noc-001')
console.log('\n[5] lgu-r6-noc-001 (Negros Occidental NOSP - active, GWA%):')
console.log(`  title:           ${nosp?.title}`)
console.log(`  is_verified:     ${nosp?.is_verified}`)
console.log(`  gwa_requirement: ${nosp?.gwa_requirement}`)
console.log(`  gwa_raw:         ${(nosp?._gwa_raw || '').slice(0, 80)}`)
console.log(`  huc_excluded:    ${nosp?.scholarship_meta?.huc_excluded}`)

// ---- SQL generation ---------------------------------------------------------

const SEED_DIR = resolve(repoRoot, 'supabase', 'seed')
mkdirSync(SEED_DIR, { recursive: true })
const OUT_PATH = resolve(SEED_DIR, 'scholarships_lgu_seed.sql')

const sqlLines = []

sqlLines.push('-- LGU Provincial & City Government Scholarships seed')
sqlLines.push(`-- Generated: ${new Date().toISOString()}`)
sqlLines.push(`-- Source: lgu_political_scholarships.txt (${total} entries after dedup)`)
sqlLines.push('-- Idempotent: ON CONFLICT (slug) DO UPDATE')
sqlLines.push('-- DO NOT apply manually -- controller runs this file.')
sqlLines.push('')

for (const s of uniqueScholarships) {
  sqlLines.push(`-- ${s._id_raw}: ${s.title}`)
  sqlLines.push(`INSERT INTO listings (`)
  sqlLines.push(`  type, slug, title, provider,`)
  sqlLines.push(`  region, province, city, scope,`)
  sqlLines.push(`  status, is_verified, external_url,`)
  sqlLines.push(`  gwa_requirement, monthly_stipend, income_ceiling,`)
  sqlLines.push(`  service_obligation_years,`)
  sqlLines.push(`  requirements, target_year_levels,`)
  sqlLines.push(`  scholarship_meta`)
  sqlLines.push(`) VALUES (`)
  sqlLines.push(`  'scholarship', ${sqlStr(s.slug)}, ${sqlStr(s.title)}, ${sqlStr(s.provider)},`)
  sqlLines.push(`  ${sqlStr(s.region)}, ${sqlStr(s.province)}, ${sqlStr(s.city)}, ${sqlStr(s.scope)},`)
  sqlLines.push(`  'active', ${sqlBool(s.is_verified)}, ${sqlStr(s.external_url)},`)
  sqlLines.push(`  ${sqlNum(s.gwa_requirement)}, ${sqlNum(s.monthly_stipend)}, ${sqlNum(s.income_ceiling)},`)
  sqlLines.push(`  ${sqlNum(s.service_obligation_years)},`)
  sqlLines.push(`  ${sqlArray(s.requirements)}, ${sqlArray(s.target_year_levels)},`)
  sqlLines.push(`  ${sqlJsonb(s.scholarship_meta)}`)
  sqlLines.push(`)`)
  sqlLines.push(`ON CONFLICT (slug) DO UPDATE SET`)
  sqlLines.push(`  title                    = EXCLUDED.title,`)
  sqlLines.push(`  provider                 = EXCLUDED.provider,`)
  sqlLines.push(`  region                   = EXCLUDED.region,`)
  sqlLines.push(`  province                 = EXCLUDED.province,`)
  sqlLines.push(`  city                     = EXCLUDED.city,`)
  sqlLines.push(`  scope                    = EXCLUDED.scope,`)
  sqlLines.push(`  status                   = EXCLUDED.status,`)
  sqlLines.push(`  is_verified              = EXCLUDED.is_verified,`)
  sqlLines.push(`  external_url             = EXCLUDED.external_url,`)
  sqlLines.push(`  gwa_requirement          = EXCLUDED.gwa_requirement,`)
  sqlLines.push(`  monthly_stipend          = EXCLUDED.monthly_stipend,`)
  sqlLines.push(`  income_ceiling           = EXCLUDED.income_ceiling,`)
  sqlLines.push(`  service_obligation_years = EXCLUDED.service_obligation_years,`)
  sqlLines.push(`  requirements             = EXCLUDED.requirements,`)
  sqlLines.push(`  target_year_levels       = EXCLUDED.target_year_levels,`)
  sqlLines.push(`  scholarship_meta         = EXCLUDED.scholarship_meta;`)
  sqlLines.push('')
}

writeFileSync(OUT_PATH, sqlLines.join('\n'), 'utf8')
console.log(`\nWrote ${uniqueScholarships.length} entries to ${OUT_PATH}`)
