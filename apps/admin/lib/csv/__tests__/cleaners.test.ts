import { describe, it, expect } from 'vitest'
import { stripBom, decodeMojibake, resolveSentinel, letterToIndex, canonicalizeRegion } from '../cleaners'

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
