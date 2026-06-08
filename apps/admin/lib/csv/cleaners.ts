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

// Windows-1252 high-range glyphs (0x80–0x9F) → their byte value. Used to invert
// the classic "UTF-8 bytes mis-decoded as Windows-1252" mojibake (â€", Ã±, â±, Ã·, …).
const CP1252_GLYPH_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
}

/**
 * General repair for "UTF-8 read as Windows-1252" mojibake. This is the inverse of
 * the corruption: re-encode each glyph to its cp1252 byte, then decode the byte run
 * as UTF-8. Correctly recovers ₱, ÷, ×, ², ³, °, √, ≥, ≤, ≠, –, —, smart quotes, ñ, é, …
 * regardless of which glyphs appear, so no hand-maintained pair list is needed.
 *
 * SAFE / IDEMPOTENT on clean text: only runs when the tell-tale lead bytes (Ã/Â/â)
 * are present, every character is cp1252-representable, AND the reconstructed bytes
 * are valid UTF-8. On any failed precondition it returns the input unchanged, so a
 * legitimate "ñ" / "é" in already-clean text is never corrupted.
 */
export function repairMojibake(text: string): string {
  if (!text || !/[ÃÂâ]/.test(text)) return text
  const bytes: number[] = []
  for (const ch of text) {
    const cp = ch.codePointAt(0)!
    if (cp <= 0xff) {
      bytes.push(cp)
    } else if (CP1252_GLYPH_TO_BYTE[cp] != null) {
      bytes.push(CP1252_GLYPH_TO_BYTE[cp])
    } else {
      return text // contains a glyph that can't be a cp1252 byte → not this mojibake
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return text // not valid UTF-8 once re-encoded → leave untouched
  }
}

/** Full text clean for imported CSV fields: BOM strip → encoding repair → residual pairs → trim. */
export function cleanImportedText(value: string | null | undefined): string {
  if (value == null) return ''
  return decodeMojibake(repairMojibake(stripBom(value))).trim()
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
