import { describe, it, expect } from 'vitest'
import { stripBom, decodeMojibake, repairMojibake, cleanImportedText, resolveSentinel, letterToIndex, canonicalizeRegion } from '../cleaners'

// Helper: produce genuine "UTF-8 read as Windows-1252" mojibake for a clean string.
const CP1252_INV: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
  0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018,
  0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc,
  0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
}
function toMojibake(clean: string): string {
  const utf8 = Buffer.from(clean, 'utf8')
  let out = ''
  for (const byte of utf8) {
    if (byte < 0x80 || byte > 0x9f) out += String.fromCodePoint(byte)
    else if (CP1252_INV[byte] != null) out += String.fromCodePoint(CP1252_INV[byte])
    // Undefined cp1252 slots (0x81/0x8D/0x8F/0x90/0x9D) → C1 control of same value,
    // matching how lenient decoders produce real-world mojibake.
    else out += String.fromCodePoint(byte)
  }
  return out
}

describe('stripBom', () => {
  it('removes a leading BOM', () => { expect(stripBom('﻿hello')).toBe('hello') })
  it('leaves clean text unchanged', () => { expect(stripBom('hello')).toBe('hello') })
})

describe('decodeMojibake', () => {
  it('repairs em-dash mojibake', () => { expect(decodeMojibake('A â€“ B')).toBe('A — B') })
  it('repairs curly apostrophe', () => { expect(decodeMojibake('Rizaâ€™s')).toBe('Riza’s') })
  it('replaces the replacement char with em dash', () => { expect(decodeMojibake('A � B')).toBe('A — B') })
  it('is idempotent on clean text', () => { expect(decodeMojibake('clean — text ‘ok')).toBe('clean — text ‘ok') })
})

describe('repairMojibake', () => {
  it('recovers peso, math symbols, dashes, and ñ from real mojibake', () => {
    const clean = '₱800 ÷ 2² × 3³ ≥ ≤ ≠ – ñ café — √75'
    expect(repairMojibake(toMojibake(clean))).toBe(clean)
  })
  it('recovers smart quotes and em dash', () => {
    const clean = '“Riza’s” test — done'
    expect(repairMojibake(toMojibake(clean))).toBe(clean)
  })
  it('is a no-op on clean ASCII', () => {
    expect(repairMojibake('plain ascii text 123')).toBe('plain ascii text 123')
  })
  it('does NOT corrupt already-clean accented text', () => {
    expect(repairMojibake('Bukidnon ñ café résumé')).toBe('Bukidnon ñ café résumé')
  })
  it('leaves irreparable/partial sequences untouched rather than corrupting', () => {
    // "â±" (only 2 chars; the ‚/0x82 byte was lost) is not valid UTF-8 once re-encoded
    expect(repairMojibake('â±800')).toBe('â±800')
  })
})

describe('cleanImportedText', () => {
  it('strips BOM, repairs encoding, and trims', () => {
    expect(cleanImportedText('﻿  ' + toMojibake('café ₱5') + '  ')).toBe('café ₱5')
  })
  it('returns empty string for null/undefined', () => {
    expect(cleanImportedText(null)).toBe('')
    expect(cleanImportedText(undefined)).toBe('')
  })
})

describe('resolveSentinel', () => {
  it('maps unconfirmed sentinels to null', () => {
    for (const s of ['', '[UNCONFIRMED]', 'UNCONFIRMED', 'Unknown', 'TBA', 'VERIFY', 'N/A', 'NA', '—', '-']) {
      expect(resolveSentinel(s)).toBeNull()
    }
  })
  it('is case-insensitive', () => { expect(resolveSentinel('unknown')).toBeNull() })
  it('trims and returns real values', () => { expect(resolveSentinel('  Manila ')).toBe('Manila') })
  it('handles null/undefined', () => { expect(resolveSentinel(null)).toBeNull(); expect(resolveSentinel(undefined)).toBeNull() })
})

describe('letterToIndex', () => {
  it('maps A-D to 0-3', () => {
    expect(letterToIndex('A')).toBe(0); expect(letterToIndex('B')).toBe(1)
    expect(letterToIndex('C')).toBe(2); expect(letterToIndex('D')).toBe(3)
  })
  it('is case-insensitive', () => { expect(letterToIndex('c')).toBe(2) })
  it('throws on invalid', () => {
    expect(() => letterToIndex('E')).toThrow(); expect(() => letterToIndex('')).toThrow()
    expect(() => letterToIndex('1')).toThrow()
  })
})

describe('canonicalizeRegion', () => {
  it('canonicalizes CALABARZON aliases', () => {
    for (const a of ['CALABARZON', 'Region IV-A', 'IV-A', '4A', 'Region 4-A']) {
      expect(canonicalizeRegion(a)).toBe('Region IV-A (CALABARZON)')
    }
  })
  it('canonicalizes NCR aliases', () => {
    for (const a of ['NCR', 'National Capital Region', 'Metro Manila']) {
      expect(canonicalizeRegion(a)).toBe('NCR')
    }
  })
  it('returns unknown input trimmed', () => { expect(canonicalizeRegion('  Atlantis ')).toBe('Atlantis') })

  it('handles Epic C no-hyphen variants IVA and IVB', () => {
    expect(canonicalizeRegion('IVA')).toBe('Region IV-A (CALABARZON)')
    expect(canonicalizeRegion('IVB')).toBe('Region IV-B (MIMAROPA)')
  })
  it('handles Region-prefix forms from non-board Master', () => {
    expect(canonicalizeRegion('Region V')).toBe('Region V (Bicol)')
    expect(canonicalizeRegion('Region VII')).toBe('Region VII (Central Visayas)')
    expect(canonicalizeRegion('Region IV-A')).toBe('Region IV-A (CALABARZON)')
    expect(canonicalizeRegion('Region IV-B')).toBe('Region IV-B (MIMAROPA)')
  })
  it('handles existing aliases that must still work', () => {
    expect(canonicalizeRegion('4A')).toBe('Region IV-A (CALABARZON)')
    expect(canonicalizeRegion('CALABARZON')).toBe('Region IV-A (CALABARZON)')
    expect(canonicalizeRegion('NCR')).toBe('NCR')
  })
})
