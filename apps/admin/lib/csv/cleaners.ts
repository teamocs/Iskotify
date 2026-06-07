export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
}

// Common Windows-1252-misread-as-UTF-8 sequences -> correct glyphs. Idempotent.
// Actual Unicode sequences as they appear when mojibake text is stored/read as UTF-16 JS strings:
//   â€" = U+00E2 U+20AC U+201C  -> em dash —
//   â€" = U+00E2 U+20AC U+2013  -> en dash – (if present)
//   â€™ = U+00E2 U+20AC U+2122  -> right single quote '
//   â€˜ = U+00E2 U+20AC U+02DC  -> left single quote '
//   â€œ = U+00E2 U+20AC U+0153  -> left double quote "
//   â€  = U+00E2 U+20AC U+009D  -> right double quote "
//   Ã± = U+00C3 U+00B1         -> ñ
//   Ã' = U+00C3 U+2019         -> Ñ
//   �                      -> em dash fallback
const MOJIBAKE_PAIRS: Array<[RegExp, string]> = [
  [/â€“/g, '—'],  // â€" -> em dash —
  [/â€–/g, '–'],  // â€" -> en dash –
  [/â€™/g, '’'],  // â€™ -> right single quote '
  [/â€˜/g, '‘'],  // â€˜ -> left single quote '
  [/â€œ/g, '“'],  // â€œ -> left double quote "
  [/â€/g, '”'],  // â€  -> right double quote "
  [/Ã±/g, 'ñ'],        // Ã± -> ñ
  [/Ã’/g, 'Ñ'],        // Ã' -> Ñ
  [/�/g, '—'],              // replacement char -> em dash fallback
]

export function decodeMojibake(text: string): string {
  let out = text
  for (const [re, rep] of MOJIBAKE_PAIRS) out = out.replace(re, rep)
  return out
}

const SENTINELS = new Set(['', '[unconfirmed]', 'unconfirmed', 'unknown', 'tba', 'verify', 'n/a', 'na', '—', '-'])

export function resolveSentinel(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return SENTINELS.has(trimmed.toLowerCase()) ? null : trimmed
}

export function letterToIndex(letter: string): number {
  const i = ['A', 'B', 'C', 'D'].indexOf((letter ?? '').trim().toUpperCase())
  if (i === -1) throw new Error(`letterToIndex: invalid letter "${letter}"`)
  return i
}

const REGION_MAP: Record<string, string> = {}
function reg(canon: string, ...aliases: string[]) {
  for (const a of aliases) REGION_MAP[a.toLowerCase()] = canon
}

reg('NCR', 'NCR', 'National Capital Region', 'Metro Manila')
reg('CAR', 'CAR', 'Cordillera Administrative Region')
reg('Region I (Ilocos)', 'Region I', 'Ilocos', 'Ilocos Region', 'I')
reg('Region II (Cagayan Valley)', 'Region II', 'Cagayan Valley', 'II')
reg('Region III (Central Luzon)', 'Region III', 'Central Luzon', 'III')
reg('Region IV-A (CALABARZON)', 'Region IV-A', 'CALABARZON', 'IV-A', '4A', 'Region 4-A', 'IVA', 'Region IV-A (CALABARZON)')
reg('Region IV-B (MIMAROPA)', 'Region IV-B', 'MIMAROPA', 'IV-B', '4B', 'IVB', 'Region IV-B (MIMAROPA)')
reg('Region V (Bicol)', 'Region V', 'Bicol', 'Bicol Region', 'V')
reg('Region VI (Western Visayas)', 'Region VI', 'Western Visayas', 'VI')
reg('Region VII (Central Visayas)', 'Region VII', 'Central Visayas', 'VII')
reg('Region VIII (Eastern Visayas)', 'Region VIII', 'Eastern Visayas', 'VIII')
reg('Region IX (Zamboanga Peninsula)', 'Region IX', 'Zamboanga Peninsula', 'IX')
reg('Region X (Northern Mindanao)', 'Region X', 'Northern Mindanao', 'X')
reg('Region XI (Davao)', 'Region XI', 'Davao Region', 'Davao', 'XI')
reg('Region XII (SOCCSKSARGEN)', 'Region XII', 'SOCCSKSARGEN', 'XII')
reg('Region XIII (Caraga)', 'Region XIII', 'Caraga', 'XIII')
reg('BARMM', 'BARMM', 'Bangsamoro', 'Bangsamoro Autonomous Region in Muslim Mindanao', 'ARMM')

export function canonicalizeRegion(raw: string): string {
  const key = (raw ?? '').trim().toLowerCase()
  return REGION_MAP[key] ?? (raw ?? '').trim()
}
