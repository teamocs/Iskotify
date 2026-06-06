#!/usr/bin/env node
// parse-national-scholarships.mjs
// Parses philippine_national_scholarships_database.txt (Windows-1252/latin1)
// and emits supabase/seed/scholarships_national_seed.sql — idempotent INSERT ON CONFLICT.
//
// Usage: node scripts/parse-national-scholarships.mjs
// Reads:  <REPO>/../../Downloads/Iskotify Upgrades/_extracted/philippine_national_scholarships_database.txt
//         (or first CLI arg as override path)
// Writes: <REPO>/supabase/seed/scholarships_national_seed.sql

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  stripBom,
  decodeMojibake,
  resolveSentinel,
  normalizeCurrency,
  parsePercent,
  slugify,
} from './scholarshipNormalize.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')

// Source file
// Default: Downloads folder on the developer's machine; pass a CLI arg to override.
const SRC =
  process.argv[2] ||
  'C:/Users/User/Downloads/Iskotify Upgrades/_extracted/philippine_national_scholarships_database.txt'

// Output SQL
const OUT = resolve(repoRoot, 'supabase/seed/scholarships_national_seed.sql')

// NOT-CONFIRMED list (from file header + FLAG annotations)
const NOT_CONFIRMED_SLUGS = new Set([
  'gbf-stem-agri',          // regional, URC community farmers only
  'snap-brights',           // regional, SN Aboitiz communities only
  'vivant-stem',            // regional, Region VII only
  'del-monte-foundation',   // regional, Bukidnon & Misamis Oriental only
  'vicsal-foundation',      // regional, Cebu partner schools only
  'shell-step',             // regional, Batangas Tabangao community only
  'globe-csr',              // flagged: NOT CONFIRMED AS STANDARD OPEN-APPLICATION
  'cocacola-foundation',    // flagged: UNVERIFIED, suspended
  'bdo-foundation',         // flagged: UNVERIFIED, limited scope
  'philsa-ad-astra',        // graduate/postgraduate only, not undergraduate
])

// ─── Raw text loading ────────────────────────────────────────────────────────
const rawBytes = readFileSync(SRC)
// File is UTF-8 (confirmed by byte-inspection: ₱ = e2 82 b1 = UTF-8 of U+20B1).
// decodeMojibake cleans up any residual copy-paste mojibake sequences.
const rawText = stripBom(rawBytes.toString('utf8'))
const text = decodeMojibake(rawText)
const lines = text.split(/\r?\n/)

// ─── Block parser ─────────────────────────────────────────────────────────────
// Each program is a numbered block "N. Title\nField\nDetails\n..." with label|value pairs.
// The file uses tab-separated or line-pair layout (label on one line, value on next).

function parseBlocks(lines) {
  const blocks = []
  let current = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Detect numbered section header: "1. Title" or "1. Title\n"
    const headerMatch = line.match(/^(\d+)\.\s+(.+)$/)
    if (headerMatch) {
      if (current) blocks.push(current)
      current = {
        _num: parseInt(headerMatch[1], 10),
        _title: headerMatch[2].trim(),
        _raw: {},
      }
      continue
    }

    if (!current) continue

    // Skip "Field" / "Details" header rows
    if (line.trim() === 'Field' || line.trim() === 'Details') continue

    // Key-value pairs: the file uses two-line format where label is on one line,
    // value on the next. We detect label lines by checking if the next line
    // is a "value" (not another known label pattern).
    // Known label names (from the file):
    const KNOWN_LABELS = new Set([
      'Scholarship Name', 'Administering Body', 'Scholarship Type', 'Sponsor',
      'Status', 'Status (AY 2025–2026)', 'Status (AY 2026–2027)', 'Status (AY 2025-2026)', 'Status (AY 2026-2027)',
      'Geographic Coverage', 'Region Restriction', 'Courses Covered', 'Schools Covered',
      'Application Period', 'Application Mode', 'Application Link', 'Official Website',
      'Selection Method', 'Has Own Entrance Exam?', 'Has Interview?', 'Exam Subtests',
      'Exam Duration', 'Exam Coverage', 'Exam Date', 'Exam Period',
      'Uses UPCAT Scores?', 'Result/Notification Timeline', 'Year Level Eligible',
      'GWA/Grade Requirement', 'Income/Financial Means Test Required?',
      'Income Ceiling', 'Additional RA 7687 Criteria', 'Additional Eligibility',
      'Eligibility', 'Eligibility Notes', 'Citizenship Requirement',
      'Documentary Requirements', 'Tuition Coverage', 'Monthly Stipend',
      'Monthly Stipend / Allowance', 'Monthly Allowance', 'Book/Learning Allowance',
      'Book Allowance', 'Book/Connectivity Allowance', 'Board & Lodging',
      'Other Benefits', 'Benefits', 'Slots Per Batch', 'Slots', 'Scholarship Duration',
      'Duration', 'Renewal GWA Requirement', 'Service Obligation', 'Contact Info',
      'Contact', 'Amount Per Year', 'Amount', 'Annual Grant Amount',
      'Tuition Cap', 'Subsidy Amount', 'Note', 'NOTE', 'FLAG',
      'Scholarship ID', 'Legal Basis', 'Program', 'Tags', 'Last Verified',
      'Has Sample Questions?', 'Exam Content Tags', 'Description',
      'Transportation Allowance', 'Lodging Allowance', 'Summer Allowance',
      'Other Qualifications', 'Age Limit', 'Scholarship Types',
      'Has Interview?',
    ])

    const trimmed = line.trim()
    // If this line is a known label AND next line exists, treat next line as value
    if (KNOWN_LABELS.has(trimmed) && i + 1 < lines.length) {
      const value = lines[i + 1].trim()
      // Only consume as value if next line is not itself a known label or section header
      if (!KNOWN_LABELS.has(value) && !value.match(/^\d+\.\s+/)) {
        current._raw[trimmed] = value
        i++ // skip next line (consumed as value)
        continue
      }
    }

    // Fallback: try tab-delimited "Label\tValue"
    if (trimmed.includes('\t')) {
      const idx = trimmed.indexOf('\t')
      const key = trimmed.slice(0, idx).trim()
      const val = trimmed.slice(idx + 1).trim()
      if (key) current._raw[key] = val
      continue
    }
  }
  if (current) blocks.push(current)
  return blocks
}

// ─── Field extractor helpers ──────────────────────────────────────────────────
function get(raw, ...keys) {
  for (const k of keys) {
    if (raw[k] !== undefined) return raw[k]
    // Try trailing variations
    for (const suffix of [' (AY 2026–2027)', ' (AY 2025–2026)', ' (AY 2026-2027)', ' (AY 2025-2026)']) {
      if (raw[k + suffix] !== undefined) return raw[k + suffix]
    }
  }
  return ''
}

function getResolved(raw, ...keys) {
  return resolveSentinel(get(raw, ...keys))
}

function parseServiceObligation(s) {
  if (!s) return null
  const lower = s.toLowerCase()
  if (lower.startsWith('no') || lower === 'not explicitly stated' ||
      lower.includes('no formal') || lower.includes('not explicitly required')) return 0
  if (lower.startsWith('yes')) {
    // Try to extract number of years
    const yrMatch = s.match(/(\d+)\s*year/)
    if (yrMatch) return parseInt(yrMatch[1], 10)
    // "per year of scholarship" → 1
    if (/per year of scholarship/i.test(s)) return 1
    return 1 // YES without explicit years → 1
  }
  if (/SAP track.*YES.*EGP track.*NO/i.test(s)) return 1 // SAP track has obligation
  return null
}

function parseHasExam(s) {
  if (!s) return false
  return /^yes/i.test(s.trim())
}

function parseStatus(raw) {
  // Check all Status variants (plain and AY-year suffixed)
  const s = get(raw,
    'Status',
    'Status (AY 2026–2027)', 'Status (AY 2025–2026)',
    'Status (AY 2026-2027)', 'Status (AY 2025-2026)'
  )
  if (!s) return 'active'
  const lower = s.toLowerCase()
  if (lower.includes('closed') || lower.includes('suspended')) return 'closed'
  if (lower.includes('open') || lower.includes('ongoing') || lower.includes('active') ||
      lower.includes('accepting soon') || lower.includes('year-round') ||
      lower.includes('part of same') || lower.includes('application')) return 'active'
  return 'active'
}

function splitList(s) {
  if (!s) return []
  // Split primarily on semicolons (safe separator for lists in this source).
  // Avoid splitting on commas because values often contain currency amounts like ₱1,000.
  const parts = s
    .split(/\s*;\s*/)
    .map(p => p.trim())
    .filter(Boolean)
  return [...new Set(parts)]
}

function splitRequirements(s) {
  if (!s) return []
  // Requirements field uses commas as list separators (not currency contexts).
  // Still avoid splitting on commas inside parentheses.
  const parts = s
    .split(/,(?![^(]*\))/)
    .map(p => p.trim())
    .filter(Boolean)
  return [...new Set(parts)]
}

function parseYearLevels(s) {
  if (!s) return []
  const lower = s.toLowerCase()
  const levels = []
  // Graduate-level ONLY: match "graduate" when it's used as the year level descriptor
  // NOT as "grade 12 graduates" which refers to high school completers
  if (/\bgraduate\b/.test(lower) && !/grade 12 grad|shs grad|high school grad|graduating class/i.test(lower)) {
    return ['Graduate']
  }
  if (/freshman|1st.year|incoming/i.test(lower)) levels.push('1st year')
  if (/sophomore|2nd.year/i.test(lower)) levels.push('2nd year')
  if (/junior|3rd.year/i.test(lower)) levels.push('3rd year')
  if (/senior|4th.year/i.test(lower)) levels.push('4th year')
  if (/5th.year/i.test(lower)) levels.push('5th year')
  if (/all year/i.test(lower)) return ['1st year', '2nd year', '3rd year', '4th year', '5th year']
  if (/continuing/i.test(lower) && levels.length === 0) return ['2nd year', '3rd year', '4th year']
  if (/transferee/i.test(lower) && !levels.includes('1st year')) levels.push('1st year')
  return levels.length > 0 ? levels : [s.trim()]
}

// ─── Program → listing mapping ────────────────────────────────────────────────
function mapProgram(block) {
  const raw = block._raw
  const title = decodeMojibake(
    resolveSentinel(get(raw, 'Scholarship Name')) || block._title
  )
  const sl = slugify(title)
  const isVerified = !NOT_CONFIRMED_SLUGS.has(sl)

  const provider = decodeMojibake(
    resolveSentinel(get(raw, 'Administering Body', 'Sponsor')) || ''
  )

  const externalUrl = resolveSentinel(get(raw, 'Application Link', 'Official Website')) || ''

  const status = parseStatus(raw)

  // Tuition coverage text (for grant_amount + coverage)
  const tuitionRaw = decodeMojibake(get(raw, 'Tuition Coverage'))
  const grantAmount = normalizeCurrency(tuitionRaw)

  // Income ceiling
  const incomeCeilingRaw = decodeMojibake(get(raw, 'Income Ceiling'))
  const incomeCeiling = normalizeCurrency(incomeCeilingRaw)

  // GWA requirement
  const gwaRaw = decodeMojibake(get(raw, 'GWA/Grade Requirement'))
  const gwaReq = parsePercent(gwaRaw)

  // Monthly stipend
  const stipendRaw = decodeMojibake(get(raw, 'Monthly Stipend', 'Monthly Stipend / Allowance', 'Monthly Allowance'))
  const monthlyStipend = normalizeCurrency(stipendRaw)

  // Service obligation
  const svcRaw = decodeMojibake(get(raw, 'Service Obligation'))
  const serviceObligation = parseServiceObligation(svcRaw)

  // Has entrance exam
  const hasExam = parseHasExam(get(raw, 'Has Own Entrance Exam?'))

  // Application window
  const appPeriod = resolveSentinel(decodeMojibake(get(raw, 'Application Period')))

  // Requirements (comma-delimited list)
  const reqRaw = decodeMojibake(get(raw, 'Documentary Requirements'))
  const requirements = splitRequirements(reqRaw)

  // Year levels
  const yearLevelRaw = decodeMojibake(get(raw, 'Year Level Eligible'))
  const targetYearLevels = parseYearLevels(yearLevelRaw)

  // Coverage (benefits summary)
  const benefitsRaw = decodeMojibake(get(raw, 'Other Benefits', 'Benefits'))
  const coverageParts = []
  if (tuitionRaw && !/^none$/i.test(tuitionRaw)) coverageParts.push(`Tuition: ${tuitionRaw}`)
  if (stipendRaw && !/^none$/i.test(stipendRaw) && !/^included/i.test(stipendRaw)) {
    coverageParts.push(`Stipend: ${stipendRaw}`)
  }
  const bookRaw = decodeMojibake(get(raw, 'Book/Learning Allowance', 'Book Allowance', 'Book/Connectivity Allowance'))
  if (bookRaw && !/^none$/i.test(bookRaw)) coverageParts.push(`Book allowance: ${bookRaw}`)
  const coverage = coverageParts.join('; ') || resolveSentinel(benefitsRaw) || ''

  // Scope override: if geographic coverage says Regional, mark scope regional
  const geoCov = get(raw, 'Geographic Coverage')
  const scope = /regional/i.test(geoCov) ? 'regional' : 'national'

  // Description (composed 1-2 sentence summary)
  const scholarshipType = decodeMojibake(get(raw, 'Scholarship Type')) || 'scholarship'
  const typeLabel = /private|corporate|foundation/i.test(scholarshipType) ? 'private' : 'government'
  const coursesCovered = decodeMojibake(get(raw, 'Courses Covered'))
  const courseSummary = coursesCovered && coursesCovered.length < 120 ? coursesCovered : 'all baccalaureate programs'
  const mainBenefit = tuitionRaw ? `covers ${tuitionRaw}` : 'provides financial assistance'
  const description = `A ${typeLabel} ${scope} scholarship administered by ${provider || 'the sponsoring organization'} for ${courseSummary.slice(0, 80)}. It ${mainBenefit}${monthlyStipend ? ` plus a monthly stipend of ₱${monthlyStipend.toLocaleString()}` : ''}.`

  // scholarship_meta
  const otherBenefitsRaw = decodeMojibake(get(raw, 'Other Benefits', 'Benefits'))
  const otherBenefits = splitList(otherBenefitsRaw)
  const renewalGwa = resolveSentinel(decodeMojibake(get(raw, 'Renewal GWA Requirement')))
  const slots = resolveSentinel(decodeMojibake(get(raw, 'Slots Per Batch', 'Slots')))
  const citizenship = resolveSentinel(decodeMojibake(get(raw, 'Citizenship Requirement')))
  const selectionMethod = resolveSentinel(decodeMojibake(get(raw, 'Selection Method')))
  const examSubtests = resolveSentinel(decodeMojibake(get(raw, 'Exam Subtests')))
  const usesUpcatRaw = get(raw, 'Uses UPCAT Scores?')
  const usesUpcat = usesUpcatRaw ? /^yes/i.test(usesUpcatRaw.trim()) : null
  const contact = resolveSentinel(decodeMojibake(get(raw, 'Contact Info', 'Contact')))
  const sourceUrl = resolveSentinel(get(raw, 'Official Website', 'Application Link'))

  const meta = {}
  if (otherBenefits.length > 0) meta.other_benefits = otherBenefits
  if (tuitionRaw) meta.tuition_coverage = decodeMojibake(tuitionRaw)
  if (renewalGwa) meta.renewal_gwa = renewalGwa
  if (slots) meta.slots = slots
  if (citizenship) meta.citizenship = citizenship
  if (selectionMethod) meta.selection_method = selectionMethod
  if (examSubtests) meta.exam_subtests = examSubtests
  if (usesUpcat !== null) meta.uses_upcat_scores = usesUpcat
  if (contact) meta.contact = contact
  if (sourceUrl) meta.source_url = sourceUrl
  const geoCovResolved = resolveSentinel(decodeMojibake(geoCov))
  if (geoCovResolved) meta.geographic_coverage = geoCovResolved
  const eligibility = resolveSentinel(decodeMojibake(get(raw, 'Eligibility', 'Eligibility Notes', 'Additional Eligibility', 'Additional RA 7687 Criteria')))
  if (eligibility) meta.eligibility_notes = eligibility

  return {
    title,
    slug: sl,
    provider,
    externalUrl,
    status,
    scope,
    isVerified,
    incomeCeiling,
    gwaReq,
    monthlyStipend,
    serviceObligation,
    hasExam,
    appPeriod,
    requirements,
    targetYearLevels,
    grantAmount,
    coverage,
    description,
    meta,
  }
}

// ─── SQL helpers ──────────────────────────────────────────────────────────────
function sqlStr(s) {
  if (s === null || s === undefined) return 'NULL'
  return `'${String(s).replace(/'/g, "''")}'`
}

function sqlBool(b) {
  if (b === null || b === undefined) return 'NULL'
  return b ? 'TRUE' : 'FALSE'
}

function sqlInt(n) {
  if (n === null || n === undefined) return 'NULL'
  return String(n)
}

function sqlArray(arr) {
  if (!arr || arr.length === 0) return 'ARRAY[]::text[]'
  const inner = arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(', ')
  return `ARRAY[${inner}]`
}

function sqlJsonb(obj) {
  if (!obj || Object.keys(obj).length === 0) return 'NULL'
  const json = JSON.stringify(obj).replace(/'/g, "''")
  return `'${json}'::jsonb`
}

function buildInsert(p) {
  const cols = [
    'type', 'scope', 'status', 'title', 'slug', 'provider', 'region',
    'external_url', 'description', 'coverage', 'is_verified',
    'income_ceiling', 'gwa_requirement', 'monthly_stipend',
    'service_obligation_years', 'has_entrance_exam', 'application_window',
    'requirements', 'target_year_levels', 'grant_amount', 'scholarship_meta',
  ]

  const vals = [
    sqlStr('scholarship'),
    sqlStr(p.scope),
    sqlStr(p.status),
    sqlStr(p.title),
    sqlStr(p.slug),
    sqlStr(p.provider || ''),
    sqlStr('National'),
    sqlStr(p.externalUrl),
    sqlStr(p.description),
    sqlStr(p.coverage),
    sqlBool(p.isVerified),
    sqlInt(p.incomeCeiling),
    p.gwaReq !== null ? String(p.gwaReq) : 'NULL',
    sqlInt(p.monthlyStipend),
    sqlInt(p.serviceObligation),
    sqlBool(p.hasExam),
    sqlStr(p.appPeriod),
    sqlArray(p.requirements),
    sqlArray(p.targetYearLevels),
    sqlInt(p.grantAmount),
    sqlJsonb(p.meta),
  ]

  const updateSet = cols
    .filter(c => c !== 'slug') // slug is the conflict key; skip created_at
    .map(c => {
      const idx = cols.indexOf(c)
      return `${c} = EXCLUDED.${c}`
    })
    .join(',\n    ')

  return (
    `INSERT INTO listings (${cols.join(', ')})\nVALUES (\n  ${vals.join(',\n  ')}\n)\nON CONFLICT (slug) DO UPDATE SET\n    ${updateSet};`
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const blocks = parseBlocks(lines)
const programs = blocks.map(mapProgram)

// Verify no duplicate slugs
const slugSet = new Set()
const dupSlugs = []
for (const p of programs) {
  if (slugSet.has(p.slug)) dupSlugs.push(p.slug)
  slugSet.add(p.slug)
}
if (dupSlugs.length > 0) {
  console.error('DUPLICATE SLUGS DETECTED:', dupSlugs)
  process.exit(1)
}

// ─── Verify / spot-check output ───────────────────────────────────────────────
console.log(`\n=== PROGRAM COUNT: ${programs.length} ===\n`)

// Null-rate report
const typedFields = [
  ['income_ceiling', p => p.incomeCeiling],
  ['gwa_requirement', p => p.gwaReq],
  ['monthly_stipend', p => p.monthlyStipend],
  ['service_obligation_years', p => p.serviceObligation],
  ['grant_amount', p => p.grantAmount],
  ['application_window', p => p.appPeriod],
  ['coverage', p => p.coverage],
  ['external_url', p => p.externalUrl],
]

console.log('=== NULL-RATE REPORT ===')
for (const [field, fn] of typedFields) {
  const nullCount = programs.filter(p => fn(p) === null).length
  console.log(`  ${field}: ${nullCount}/${programs.length} null`)
}

// Spot-check 5 programs
const SPOT_SLUGS = ['dost-sei-equity', 'dost-sei-merit', 'gbf-stem', 'bpi-pagpupugay', 'globe-csr']
console.log('\n=== SPOT-CHECK (5 programs) ===')
for (const slug of SPOT_SLUGS) {
  const p = programs.find(x => x.slug === slug)
  if (!p) { console.log(`  [MISSING: ${slug}]`); continue }
  console.log(`\n  [${slug}]`)
  console.log(`    title:                  ${p.title}`)
  console.log(`    provider:               ${p.provider}`)
  console.log(`    status:                 ${p.status}`)
  console.log(`    is_verified:            ${p.isVerified}`)
  console.log(`    income_ceiling:         ${p.incomeCeiling}`)
  console.log(`    gwa_requirement:        ${p.gwaReq}`)
  console.log(`    monthly_stipend:        ${p.monthlyStipend}`)
  console.log(`    service_obligation_yrs: ${p.serviceObligation}`)
  console.log(`    has_entrance_exam:      ${p.hasExam}`)
  console.log(`    grant_amount:           ${p.grantAmount}`)
  console.log(`    scope:                  ${p.scope}`)
}

// Confirm no duplicate slugs
console.log(`\n=== SLUG UNIQUENESS: ${programs.length} programs, ${slugSet.size} unique slugs — OK ===\n`)

// ─── Emit SQL ─────────────────────────────────────────────────────────────────
mkdirSync(resolve(repoRoot, 'supabase/seed'), { recursive: true })

const header = `-- scholarships_national_seed.sql
-- Source: philippine_national_scholarships_database.txt (researched June 2, 2026)
-- Generated: ${new Date().toISOString().slice(0, 10)} by scripts/parse-national-scholarships.mjs
-- Idempotent: INSERT ... ON CONFLICT (slug) DO UPDATE
-- DO NOT apply directly; controller applies via supabase migration tooling.
-- Programs: ${programs.length} (${programs.filter(p => p.isVerified).length} verified, ${programs.filter(p => !p.isVerified).length} unverified/flagged)
`

const sql = [header, ...programs.map(buildInsert)].join('\n\n') + '\n'

writeFileSync(OUT, sql, 'utf8')
console.log(`SQL written → ${OUT}`)
console.log(`Total programs: ${programs.length}`)
