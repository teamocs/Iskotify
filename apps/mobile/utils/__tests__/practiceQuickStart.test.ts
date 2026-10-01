import { quickStartTiles, primaryFocusExam, upcatInFocus, upcatSubtestHref, type QuickStartInput } from '../practiceQuickStart'

const BPS = [
  { slug: 'upcat', acronym: 'UPCAT' },
  { slug: 'acet', acronym: 'ACET' },
]
const base: QuickStartInput = { focusSlugs: [], blueprints: BPS, weakTopic: null, mistakesCount: 0 }
const tile = (input: Partial<QuickStartInput>, key: string) =>
  quickStartTiles({ ...base, ...input }).find(t => t.key === key)!

describe('primaryFocusExam / upcatInFocus', () => {
  it('is the first focus exam with a runnable blueprint (the diagnostic target rule)', () => {
    expect(primaryFocusExam(['school:abc', 'dcat-dlsu', 'acet', 'upcat'], ['upcat', 'acet'])).toBe('acet')
    expect(primaryFocusExam(['dcat-dlsu'], ['upcat'])).toBeNull()
  })
  it('UPCAT is in focus only when its listing slug is', () => {
    expect(upcatInFocus(['acet', 'upcat'])).toBe(true)
    expect(upcatInFocus(['acet'])).toBe(false)
  })
})

describe('quickStartTiles', () => {
  it('always returns the four tiles in order', () => {
    expect(quickStartTiles(base).map(t => t.key)).toEqual(['diagnostic', 'sprint', 'drill', 'mistakes'])
  })

  describe('Diagnostic', () => {
    it('targets the focus exam when it is not UPCAT and has a runnable blueprint', () => {
      expect(tile({ focusSlugs: ['acet', 'upcat'] }, 'diagnostic').href).toBe('/practice/diagnostic?exam=acet')
    })
    it('is the plain (UPCAT) diagnostic when UPCAT leads or nothing in focus is runnable', () => {
      expect(tile({ focusSlugs: ['upcat', 'acet'] }, 'diagnostic').href).toBe('/practice/diagnostic')
      expect(tile({ focusSlugs: ['dcat-dlsu'] }, 'diagnostic').href).toBe('/practice/diagnostic')
      expect(tile({}, 'diagnostic').href).toBe('/practice/diagnostic')
    })
  })

  describe('Sprint', () => {
    it("opens the focus exam's prestart (where Study Sprint starts)", () => {
      const t = tile({ focusSlugs: ['acet'] }, 'sprint')
      expect(t.href).toBe('/practice/exam/acet')
      expect(t.subtitle).toBe('ACET · 30 min')
    })
    it('falls back to the mock exam list when no focus exam is runnable', () => {
      const t = tile({ focusSlugs: ['dcat-dlsu'] }, 'sprint')
      expect(t.href).toBe('/practice/exam')
      expect(t.subtitle).toBe('Pick an exam · 30 min')
    })
  })

  describe('Drill', () => {
    it('opens the UPCAT subtest picker when UPCAT is in focus', () => {
      const t = tile({ focusSlugs: ['acet', 'upcat'], weakTopic: { id: 't1', name: 'Fractions' } }, 'drill')
      expect(t.href).toBeNull()
      expect(t.subtitle).toBe('Pick a UPCAT subtest')
    })
    it('otherwise drills the weakest flashcard topic', () => {
      const t = tile({ focusSlugs: ['acet'], weakTopic: { id: 't1', name: 'Fractions' } }, 'drill')
      expect(t.href).toBe('/practice/t1')
      expect(t.subtitle).toBe('Fractions')
    })
    it('otherwise studies the focus exam by subject', () => {
      const t = tile({ focusSlugs: ['school:x', 'acet'] }, 'drill')
      expect(t.href).toBe('/practice/review/acet')
      expect(t.subtitle).toBe('By subject')
    })
    it('a school-only focus studies the general entrance subjects', () => {
      expect(tile({ focusSlugs: ['school:x'] }, 'drill').href).toBe('/practice/review/general-cet')
    })
    it('with no focus at all, asks for an exam first', () => {
      const t = tile({}, 'drill')
      expect(t.href).toBe('/(tabs)/explore')
      expect(t.subtitle).toBe('Choose an exam first')
    })
  })

  describe('Mistakes', () => {
    it('shows the count and opens Mistakes mode', () => {
      const t = tile({ mistakesCount: 7 }, 'mistakes')
      expect(t.href).toBe('/practice/mistakes')
      expect(t.subtitle).toBe('7 to retry')
      expect(t.muted).toBe(false)
    })
    it('looks quiet with "None yet" at 0 but still opens (to the empty state)', () => {
      const t = tile({ mistakesCount: 0 }, 'mistakes')
      expect(t.href).toBe('/practice/mistakes')
      expect(t.subtitle).toBe('None yet')
      expect(t.muted).toBe(true)
    })
    it('says nothing about the count while it loads', () => {
      const t = tile({ mistakesCount: null }, 'mistakes')
      expect(t.subtitle).toBe('Retry what you missed')
      expect(t.muted).toBe(false)
    })
    it('singular for one', () => {
      expect(tile({ mistakesCount: 1 }, 'mistakes').subtitle).toBe('1 to retry')
    })
  })
})

describe('upcatSubtestHref', () => {
  it('is a quick drill of that subtest', () => {
    expect(upcatSubtestHref('Reading Comprehension')).toBe('/practice/upcat/Reading%20Comprehension?mode=quick')
  })
})
