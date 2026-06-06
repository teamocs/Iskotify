#!/usr/bin/env node
// scholarshipNormalize.mjs — Pure normalization helpers for national scholarship data.
// Shared between parse-national-scholarships.mjs and its unit tests.

// --- BOM strip ---
export function stripBom(text) {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

// --- Mojibake decoder (Windows-1252 misread as UTF-8 → correct glyphs) ---
// Pairs copied from apps/admin/lib/csv/cleaners.ts
const MOJIBAKE_PAIRS = [
  [/â€"/g, '—'],   // â€" -> em dash —
  [/â€–/g, '–'], // â€" -> en dash –
  [/â€™/g, '’'],   // â€™ -> right single quote '
  [/â€˜/g, '‘'],   // â€˜ -> left single quote '
  [/â€œ/g, '“'],   // â€œ -> left double quote "
  [/â€/g, '”'],    // â€  -> right double quote "
  [/Ã±/g, 'ñ'],   // Ã± -> ñ
  [/Ã'/g, 'Ñ'],   // Ã' -> Ñ
  [/�/g, '—'], // replacement char -> em dash fallback
  // Latin1 read of windows-1252 produces these literal 2-3 byte sequences
  // when the file is decoded as latin1 instead of cp1252:
  [/â/g, ''],          // stray â (already handled above in pairs)
]

// In practice, reading the file as latin1 in Node preserves the raw bytes.
// The mojibake appears as multi-character sequences like â± (for ₱) or â (for —).
// We handle the full sequences first (longest match wins via ordering).
const LATIN1_PAIRS = [
  [/â±/g, '₱'],   // â± latin1 bytes of ₱ (U+20B1)
  [/â€“/g, '—'],  // em dash bytes
  [/â€–/g, '–'],  // en dash bytes
  [/â€™/g, '’'],  // right single quote
  [/â€˜/g, '‘'],  // left single quote
  [/â€œ/g, '“'],  // left double quote
  [/â€/g, '”'],  // right double quote
  [/�/g, '—'],          // replacement char -> em dash
]

export function decodeMojibake(text) {
  let out = text
  // Apply latin1 byte-sequence fixes first (these appear when reading file as latin1)
  for (const [re, rep] of LATIN1_PAIRS) out = out.replace(re, rep)
  // Then apply standard mojibake pairs
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  return out
}

// --- Sentinel resolver ---
// Resolves empty/unknown/unconfirmed strings to null.
const SENTINELS = new Set([
  '', 'unconfirmed', '[unconfirmed]', 'unknown', 'tba', 'verify',
  'n/a', 'na', '—', '-', 'none', 'not applicable',
])

export function resolveSentinel(value) {
  if (value == null) return null
  const trimmed = value.trim()
  if (SENTINELS.has(trimmed.toLowerCase())) return null
  return trimmed || null
}

// --- Currency normalizer ---
// Returns integer peso amount from strings like:
//   '₱8,000/month' → 8000
//   'Up to ₱40,000/academic year' → 40000
//   '₱10,000/year' → 10000
//   'N/A' / 'Full' / 'Free' → null
// Extracts FIRST peso amount only, strips commas.
export function normalizeCurrency(s) {
  if (!s) return null
  const cleaned = decodeMojibake(s.trim())
  const lower = cleaned.toLowerCase()
  if (SENTINELS.has(lower)) return null
  if (lower === 'full' || lower === 'free') return null
  // Match ₱ (U+20B1) followed by digits (with optional commas)
  const m = cleaned.match(/[₱P]\s*([\d,]+)/)
  if (!m) return null
  const val = parseInt(m[1].replace(/,/g, ''), 10)
  return isNaN(val) ? null : val
}

// --- Percent parser ---
// Returns number 0–100 for a plain percentage, null for:
//   - class-rank strings ('top 5% of graduating class')
//   - 1.0–5.0 GPA scale strings ('GWA 2.75', 'GPA 2.5')
//   - no numeric content
export function parsePercent(s) {
  if (!s) return null
  const cleaned = decodeMojibake(s.trim())
  const lower = cleaned.toLowerCase()
  if (SENTINELS.has(lower)) return null

  // Reject class-rank descriptions (contain 'top' or 'class')
  if (/\btop\b/.test(lower) || /\bclass\b/.test(lower)) return null

  // Reject GWA/GPA on 1.0–5.0 scale (presence of keyword + small number)
  if (/\bgwa\b|\bgpa\b/.test(lower)) {
    // If the number is in range 1.0–5.0 it's a 5-point scale, not percentage
    const scaleMatch = cleaned.match(/[\d.]+/)
    if (scaleMatch) {
      const n = parseFloat(scaleMatch[0])
      if (!isNaN(n) && n >= 1.0 && n <= 5.0) return null
    }
  }

  // Look for explicit % sign
  const pctMatch = cleaned.match(/([\d.]+)\s*%/)
  if (pctMatch) {
    const val = parseFloat(pctMatch[1])
    if (!isNaN(val) && val >= 0 && val <= 100) return val
    return null
  }

  // Look for bare number that looks like a percentage (80–100 range typical for PH GWA %)
  const bareMatch = cleaned.match(/\b(\d{2,3}(?:\.\d+)?)\b/)
  if (bareMatch) {
    const val = parseFloat(bareMatch[1])
    if (!isNaN(val) && val >= 50 && val <= 100) return val
  }

  return null
}

// --- Slugify ---
// Produces stable kebab IDs from scholarship names, collision-free across ~55 programs.
// Strategy: use known acronyms / short identifiers, fall back to computed slug.
const SLUG_OVERRIDES = new Map([
  ['DOST-SEI Undergraduate Scholarship (Merit / S&T Scholarship)', 'dost-sei-merit'],
  ['DOST-SEI Undergraduate Scholarship under RA 7687 (Equity/Financial Need Track)', 'dost-sei-equity'],
  ['Junior Level Science Scholarship (JLSS)', 'dost-sei-jlss'],
  ['CHED Merit Scholarship Program (CMSP)', 'ched-merit'],
  ['Bagong Pilipinas Merit Scholarship Program (BPMSP)', 'ched-bpmsp'],
  ['CHED Tulong Dunong Program (TDP)', 'ched-tulong-dunong'],
  ['Tertiary Education Subsidy (TES)', 'unifast-tes'],
  ['Free Higher Education under the Universal Access to Quality Tertiary Education Act (RA 10931)', 'ra10931-free-tuition'],
  ['Education for Development Scholarship Program (EDSP)', 'owwa-edsp'],
  ['OFW Dependent Scholarship Program (ODSP)', 'owwa-odsp'],
  ['PVAO Educational Benefit (for Veterans’ Dependents)', 'pvao-educational-benefit'],
  ["PVAO Educational Benefit (for Veterans' Dependents)", 'pvao-educational-benefit'],
  ['AFP Savings and Loan Association, Inc. (AFPSLAI) Scholarship and Educational Assistance Program (SEAP)', 'afpslai-seap'],
  ['SM Foundation College Scholarship', 'sm-foundation-college'],
  ['MBFI-ACCESS (Assistance for the Completion of College Education for Superior Students)', 'mbfi-access'],
  ['U-Go Scholar Grant', 'ayala-u-go'],
  ['Megaworld Foundation Scholarship', 'megaworld-foundation'],
  ['GBF STEM College Scholarship (formerly GBF-Gokongwei Group STEM Scholarship for Excellence)', 'gbf-stem'],
  ['Aboitiz Future Leaders Scholarship', 'aboitiz-future-leaders'],
  ['Gabay Guro Scholarship Program by PLDT-Smart Foundation', 'pldt-gabay-guro'],
  ['Tulong Aral ng Petron (TAP) College Scholarship', 'petron-tap'],
  ['Pagpupugay Scholarship Program', 'bpi-pagpupugay'],
  ['Access, Curriculum, and Employability (ACE) Scholarship Program', 'jollibee-ace'],
  ['CHED Bawat Barangay Makikinabang (Barangay Presidential Scholars Program)', 'ched-bpsp'],
  ['CHED CoScho – Scholarship Program for Coconut Farmers and their Families', 'ched-coscho'],
  ['CHED CoScho - Scholarship Program for Coconut Farmers and their Families', 'ched-coscho'],
  ['CHED ACEF-GIAHEP (Agricultural Competitiveness Enhancement Fund – Grants-in-Aid for Higher Education Program)', 'ched-acef-giahep'],
  ['CHED ACEF-GIAHEP (Agricultural Competitiveness Enhancement Fund - Grants-in-Aid for Higher Education Program)', 'ched-acef-giahep'],
  ['CHED AHEAD Grant (Allied Health Experiential Assistance for Deserving Students)', 'ched-ahead'],
  ['BFAR Fisherfolk Children Educational Grant (FCEG)', 'bfar-fceg'],
  ['BFAR Fisheries Industry Leaders Grant (FILG)', 'bfar-filg'],
  ['Iskolar ng LANDBANK Program', 'landbank-iskolar'],
  ['GSIS Educational Subsidy Program (GESP)', 'gsis-gesp'],
  ['DAR Scholarship Program for Dependents of Agrarian Reform Beneficiaries (DSP-DARBs)', 'dar-dsp-darbs'],
  ['PCSO Educational Assistance Program', 'pcso-educational-assistance'],
  ['DBP INSPIRE Scholarship (Investments and Partnerships for Inclusive Revitalization through Scholarships in Education)', 'dbp-inspire'],
  ['PhilSA AD ASTRA Scholarship Program (Advanced Degrees for Accelerating Strategic Space R&D and Applications)', 'philsa-ad-astra'],
  ['GBF TeachSTEM College Scholarship', 'gbf-teachstem'],
  ['GBF Next Gen Scholarship for Excellence', 'gbf-next-gen'],
  ['GBF STEM-Agri Scholarship Program (URC-BCFG Agri Partners)', 'gbf-stem-agri'],
  ['SN Aboitiz Power Group BRIGHTS Scholarship (Bridging Gaps in Higher Education Through Tertiary Scholarships)', 'snap-brights'],
  ['Vivant Foundation STEM Scholarship', 'vivant-stem'],
  ['Insular Foundation Gold Eagle College Scholarship Grant for STEM', 'insular-gold-eagle'],
  ['Mercury Drug Foundation (MDFI) Gawad Talino College Scholarship', 'mdfi-gawad-talino'],
  ['Del Monte Foundation Scholarship Program', 'del-monte-foundation'],
  ['Security Bank Foundation Regalo Mo, Kinabukasan Ko (RMKK) Scholarship', 'sbf-rmkk'],
  ['Vicsal Foundation College Scholarship Program', 'vicsal-foundation'],
  ['APTSFI Scholarship Program (Andres P. Tamayo Sr. Foundation, Inc.)', 'aptsfi'],
  ['Globe Telecom CSR Scholarship Program', 'globe-csr'],
  ['Pilipinas Shell Foundation STEP Scholarship (Shell Technical Education Program)', 'shell-step'],
  ['Coca-Cola Foundation Philippines Scholarship', 'cocacola-foundation'],
  ['San Miguel Foundation Scholarship Program', 'san-miguel-foundation'],
  ['BDO Foundation Educational Assistance Program', 'bdo-foundation'],
  ['PHINMA Education Hawak Kamay Scholarship', 'phinma-hawak-kamay'],
  ['Panasonic Manufacturing Philippines Corporation Scholarship Program', 'panasonic-ph'],
  ['Samsung Electro-Mechanics Philippines Corporation (SEMPHIL) Scholarship Program', 'semphil'],
  ['GrabScholar College Scholarship', 'grab-scholar'],
  ['Shell GMBK-FUEL Scholarship (Gas Mo, Bukas Ko – Fund for University Education and Leadership)', 'shell-gmbk-fuel'],
  ['Shell GMBK-FUEL Scholarship (Gas Mo, Bukas Ko - Fund for University Education and Leadership)', 'shell-gmbk-fuel'],
])

export function slugify(name) {
  if (!name) return 'unknown'
  const decoded = decodeMojibake(name.trim())
  if (SLUG_OVERRIDES.has(decoded)) return SLUG_OVERRIDES.get(decoded)
  // Fallback: compute slug from name
  return decoded
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
