import { quickStartTiles, primaryFocusExam, practiceFocusExam, upcatInFocus, upcatSubtestHref, type QuickStartInput } from '../practiceQuickStart'

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
  it('practiceFocusExam: the primary focus exam, else the first exam in focus, else a school focus', () => {
    expect(practiceFocusExam(['dcat-dlsu', 'acet', 'upcat'], ['upcat', 'acet'])).toBe('acet')
    expect(practiceFocusExam(['school:abc', 'dcat-dlsu'], ['upcat'])).toBe('dcat-dlsu')
    expect(practiceFocusExam(['school:abc'], ['upcat'])).toBe('school:abc')
    expect(practiceFocusExam([], ['upcat'])).toBeNull()
  })
  it('UPCAT is in focus only when its listing slug is', () => {
    expect(upcatInFocus(['acet', 'upcat'])).toBe(true)
    expect(upcatInFocus(['acet'])).toBe(false)
  })
})

describe('quickStartTiles', () => {
  it('returns the four tiles in order when UPCAT is in focus', () => {
    expect(quickStartTiles({ ...base, focusSlugs: ['upcat'] }).map(t => t.key)).toEqual(['diagnostic', 'sprint', 'drill', 'mistakes'])
  })

  it('leaves Mistakes out when UPCAT is not in focus (Mistakes is UPCAT-only)', () => {
    expect(quickStartTiles(base).map(t => t.key)).toEqual(['diagnostic', 'sprint', 'drill'])
    expect(quickStartTiles({ ...base, focusSlugs: ['acet', 'dcat-dlsu'], mistakesCount: 4 }).map(t => t.key)).toEqual(['diagnostic', 'sprint', 'drill'])
  })

  describe('while blueprints load', () => {
    it('shows neutral subtitles and disables the exam-dependent tiles (no flicker of a wrong target)', () => {
      const tiles = quickStartTiles({ ...base, focusSlugs: ['acet', 'upcat'], blueprints: [], loading: true })
      const by = (k: string) => tiles.find(t => t.key === k)!
      expect(by('sprint').subtitle).toBe('30 min')
      expect(by('sprint').subtitle).not.toMatch(/Pick an exam/)
      expect(by('diagnostic').subtitle).toBe('See where you stand')
      expect(by('drill').subtitle).toBe('Quick practice')
      for (const k of ['diagnostic', 'sprint', 'drill']) expect(by(k).disabled).toBe(true)
      expect(by('mistakes').disabled).toBe(false)
    })
    it('nothing is disabled once loaded', () => {
      expect(quickStartTiles({ ...base, focusSlugs: ['upcat'] }).every(t => !t.disabled)).toBe(true)
    })
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
    it('opens the UPCAT subtest picker when UPCAT is the primary focus exam', () => {
      const t = tile({ focusSlugs: ['upcat', 'acet'], weakTopic: { id: 't1', name: 'Fractions' } }, 'drill')
      expect(t.href).toBeNull()
      expect(t.subtitle).toBe('Pick a UPCAT subtest')
    })
    it('follows the same primary focus exam as Sprint/Diagnostic: a non-UPCAT primary never opens the UPCAT picker', () => {
      expect(tile({ focusSlugs: ['acet', 'upcat'] }, 'drill').href).toBe('/practice/review/acet')
      expect(tile({ focusSlugs: ['acet', 'upcat'], weakTopic: { id: 't1', name: 'Fractions' } }, 'drill').href).toBe('/practice/t1')
    })
    it('a non-runnable focus exam ahead of UPCAT does not steal Drill from the primary (UPCAT)', () => {
      expect(tile({ focusSlugs: ['dcat-dlsu', 'upcat'] }, 'drill').href).toBeNull()
    })
    it('with no runnable focus exam, falls back to the first focus exam (UPCAT picker if that is UPCAT)', () => {
      expect(tile({ focusSlugs: ['upcat'], blueprints: [] }, 'drill').href).toBeNull()
      expect(tile({ focusSlugs: ['dcat-dlsu'], blueprints: [] }, 'drill').href).toBe('/practice/review/dcat-dlsu')
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
      const t = tile({ focusSlugs: ['upcat'], mistakesCount: 7 }, 'mistakes')
      expect(t.href).toBe('/practice/mistakes')
      expect(t.subtitle).toBe('7 to retry')
      expect(t.muted).toBe(false)
    })
    it('looks quiet with "None yet" at 0 but still opens (to the empty state)', () => {
      const t = tile({ focusSlugs: ['upcat'], mistakesCount: 0 }, 'mistakes')
      expect(t.href).toBe('/practice/mistakes')
      expect(t.subtitle).toBe('None yet')
      expect(t.muted).toBe(true)
    })
    it('says nothing about the count while it loads', () => {
      const t = tile({ focusSlugs: ['upcat'], mistakesCount: null }, 'mistakes')
      expect(t.subtitle).toBe('Retry what you missed')
      expect(t.muted).toBe(false)
    })
    it('singular for one', () => {
      expect(tile({ focusSlugs: ['upcat'], mistakesCount: 1 }, 'mistakes').subtitle).toBe('1 to retry')
    })
  })
})

describe('upcatSubtestHref', () => {
  it('is a quick drill of that subtest', () => {
    expect(upcatSubtestHref('Reading Comprehension')).toBe('/practice/upcat/Reading%20Comprehension?mode=quick')
  })
})
