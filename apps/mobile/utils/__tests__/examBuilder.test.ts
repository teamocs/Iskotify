import { buildBlueprintExam, scoreBlueprintExam, filterCourseNotesByClusters, estimatePercentileBand, groupReviewBySection, sectionChipState, orderBlueprintsForUser } from '../examBuilder'
import type { ExamBlueprint } from '../../services/examBlueprints'
import type { RawUpcatQuestion } from '../upcatExam'

function q(id: string, n: number): RawUpcatQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `${id}-${i}`, subtest: id, questionText: `Q${i}`, options: ['a','b','c','d'],
    correctIndex: 0, explanation: '', setId: null, setPosition: null,
  }))
}
const bp = (over: Partial<ExamBlueprint> = {}): ExamBlueprint => ({
  slug: 'x', name: 'X', acronym: 'X', totalItems: 0, totalTimeMinutes: 60,
  hasGuessingPenalty: false, guessingPenalty: 0.25, sectionBlocked: false, scoringNote: '', mechanicsNote: '',
  sections: [
    { id: 'x:1', name: 'Math', skillCategory: 'Mathematics', itemCount: 3, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
    { id: 'x:2', name: 'Abstract', skillCategory: 'Abstract/Non-Verbal Reasoning', itemCount: 2, timeMinutes: null, requiresSpatialLogic: true, displayOrder: 2 },
  ],
  courseNotes: [], ...over,
})

describe('buildBlueprintExam', () => {
  it('samples item_count per section from its category pool; excludes empty sections', () => {
    const pools = new Map<string, RawUpcatQuestion[]>([['Mathematics', q('Mathematics', 10)]]) // no Abstract content
    const built = buildBlueprintExam(bp(), pools, [])
    expect(built.runnable.map(s => s.section.name)).toEqual(['Math'])
    expect(built.runnable[0]!.questions).toHaveLength(3)
    expect(built.comingSoon.map(s => s.name)).toEqual(['Abstract'])
    expect(built.totalQuestions).toBe(3)
  })

  it('caps a section at the available pool size when smaller than item_count', () => {
    const pools = new Map([['Mathematics', q('Mathematics', 2)]])
    const built = buildBlueprintExam(bp(), pools, [])
    expect(built.runnable[0]!.questions).toHaveLength(2)
  })
})

describe('scoreBlueprintExam', () => {
  it('no penalty: adjusted equals correct', () => {
    expect(scoreBlueprintExam(10, 6, 4, false, 0.25)).toMatchObject({ correct: 6, wrong: 4, blank: 0, adjusted: 6 })
  })
  it('penalty: adjusted = correct - penalty*wrong, blanks ignored', () => {
    const s = scoreBlueprintExam(10, 6, 2, true, 0.25) // 2 blank
    expect(s).toMatchObject({ correct: 6, wrong: 2, blank: 2 })
    expect(s.adjusted).toBeCloseTo(6 - 0.5)
  })
})

describe('filterCourseNotesByClusters', () => {
  const notes = [
    { courseCluster: 'all', note: 'A', minPercentile: null },
    { courseCluster: 'Health Sciences', note: 'B', minPercentile: 90 },
    { courseCluster: 'Engineering', note: 'C', minPercentile: 90 },
  ]
  it('returns ALL notes when the student has no target clusters', () => {
    expect(filterCourseNotesByClusters(notes, [])).toEqual(notes)
  })
  it('keeps "all" notes plus notes matching the student clusters', () => {
    const out = filterCourseNotesByClusters(notes, ['Health Sciences'])
    expect(out.map(n => n.note)).toEqual(['A', 'B'])
  })
  it('keeps only "all" when no cluster matches', () => {
    const out = filterCourseNotesByClusters(notes, ['Law'])
    expect(out.map(n => n.note)).toEqual(['A'])
  })
  it('is case-insensitive on cluster names', () => {
    const out = filterCourseNotesByClusters(notes, ['health sciences'])
    expect(out.map(n => n.note)).toEqual(['A', 'B'])
  })
})

describe('estimatePercentileBand', () => {
  it('clamps and labels tiers', () => {
    expect(estimatePercentileBand(95).band).toBe('Top tier')
    expect(estimatePercentileBand(80).band).toBe('Competitive')
    expect(estimatePercentileBand(60).band).toBe('Developing')
    expect(estimatePercentileBand(20).band).toBe('Foundational')
  })
  it('returns a percentile equal to the clamped raw pct', () => {
    expect(estimatePercentileBand(73).percentile).toBe(73)
    expect(estimatePercentileBand(150).percentile).toBe(99)
    expect(estimatePercentileBand(-5).percentile).toBe(1)
  })
})

describe('groupReviewBySection', () => {
  // Helper: build a minimal FlatQuestion-like entry
  function fq(sectionName: string) { return { sectionName } }

  it('groups questions by section in order of first appearance', () => {
    const questions = [fq('Math'), fq('Math'), fq('Science'), fq('Science')]
    const answers = { 0: 0, 1: 1, 2: 2, 3: 3 }
    const correctIndexes = [0, 0, 0, 0]
    const sections = groupReviewBySection(questions, answers, correctIndexes)
    expect(sections.map(s => s.sectionName)).toEqual(['Math', 'Science'])
  })

  it('places incorrect answers first within a section, then unanswered, then correct', () => {
    // Q0 correct, Q1 incorrect, Q2 unanswered — all in one section
    const questions = [fq('A'), fq('A'), fq('A')]
    const answers: Record<number, number> = { 0: 0, 1: 2 } // Q2 not answered
    const correctIndexes = [0, 0, 0] // Q0 correct, Q1 wrong (selected 2, correct 0)
    const sections = groupReviewBySection(questions, answers, correctIndexes)
    expect(sections).toHaveLength(1)
    const refs = sections[0]!.questionRefs
    // wrong first, then unanswered, then correct
    expect(refs[0]).toMatchObject({ flatIndex: 1, status: 'incorrect' })
    expect(refs[1]).toMatchObject({ flatIndex: 2, status: 'unanswered' })
    expect(refs[2]).toMatchObject({ flatIndex: 0, status: 'correct' })
  })

  it('correctly computes correct/total counts per section', () => {
    const questions = [fq('Math'), fq('Math'), fq('Science')]
    const answers: Record<number, number> = { 0: 0, 1: 1, 2: 0 }
    const correctIndexes = [0, 0, 0] // Math: Q0 correct, Q1 wrong; Science: Q2 correct
    const sections = groupReviewBySection(questions, answers, correctIndexes)
    const math = sections.find(s => s.sectionName === 'Math')!
    const sci = sections.find(s => s.sectionName === 'Science')!
    expect(math.correct).toBe(1)
    expect(math.total).toBe(2)
    expect(sci.correct).toBe(1)
    expect(sci.total).toBe(1)
  })

  it('treats unanswered questions (no entry in answers) as unanswered status', () => {
    const questions = [fq('X')]
    const answers: Record<number, number> = {}
    const correctIndexes = [0]
    const sections = groupReviewBySection(questions, answers, correctIndexes)
    expect(sections[0]!.questionRefs[0]!.status).toBe('unanswered')
    expect(sections[0]!.correct).toBe(0)
    expect(sections[0]!.total).toBe(1)
  })

  it('preserves original order within each status bucket', () => {
    // Q0 wrong, Q1 wrong, Q2 correct, Q3 wrong — wrong bucket should be [0,1,3]
    const questions = [fq('S'), fq('S'), fq('S'), fq('S')]
    const answers: Record<number, number> = { 0: 1, 1: 1, 2: 0, 3: 1 }
    const correctIndexes = [0, 0, 0, 0]
    const sections = groupReviewBySection(questions, answers, correctIndexes)
    const refs = sections[0]!.questionRefs
    expect(refs.map(r => r.flatIndex)).toEqual([0, 1, 3, 2])
    expect(refs.map(r => r.status)).toEqual(['incorrect', 'incorrect', 'incorrect', 'correct'])
  })

  it('handles empty question list', () => {
    const sections = groupReviewBySection([], {}, [])
    expect(sections).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// sectionChipState (B2)
// ---------------------------------------------------------------------------

const bounds3 = [
  { name: 'Math', start: 0, end: 3 },
  { name: 'Science', start: 3, end: 6 },
  { name: 'English', start: 6, end: 9 },
]

describe('sectionChipState', () => {
  describe('when sectionBlocked=true', () => {
    it('only the active section is enabled; others are disabled', () => {
      const chips = sectionChipState(bounds3, 4, 3, true) // idx=4 → Science active
      expect(chips.find(c => c.name === 'Math')!.disabled).toBe(true)
      expect(chips.find(c => c.name === 'Science')!.disabled).toBe(false)
      expect(chips.find(c => c.name === 'English')!.disabled).toBe(true)
    })

    it('marks active correctly at the start boundary', () => {
      const chips = sectionChipState(bounds3, 3, 3, true) // idx=3 → first item of Science
      expect(chips.find(c => c.name === 'Science')!.active).toBe(true)
      expect(chips.find(c => c.name === 'Science')!.disabled).toBe(false)
    })

    it('marks active correctly at one-before-end boundary', () => {
      const chips = sectionChipState(bounds3, 5, 3, true) // idx=5 → last item of Science (end=6)
      expect(chips.find(c => c.name === 'Science')!.active).toBe(true)
      expect(chips.find(c => c.name === 'English')!.active).toBe(false)
    })
  })

  describe('when sectionBlocked=false', () => {
    it('all chips are enabled regardless of active state', () => {
      const chips = sectionChipState(bounds3, 1, 0, false)
      expect(chips.every(c => !c.disabled)).toBe(true)
    })

    it('still marks the correct section as active', () => {
      const chips = sectionChipState(bounds3, 7, 0, false) // idx=7 → English
      expect(chips.find(c => c.name === 'English')!.active).toBe(true)
      expect(chips.find(c => c.name === 'Math')!.active).toBe(false)
      expect(chips.find(c => c.name === 'Science')!.active).toBe(false)
    })
  })

  it('returns empty array for empty bounds', () => {
    expect(sectionChipState([], 0, 0, false)).toHaveLength(0)
  })

  it('preserves start values in returned chips', () => {
    const chips = sectionChipState(bounds3, 0, 0, false)
    expect(chips.map(c => c.start)).toEqual([0, 3, 6])
  })
})

// ---------------------------------------------------------------------------
// orderBlueprintsForUser (C2)
// ---------------------------------------------------------------------------

describe('orderBlueprintsForUser', () => {
  const bps = [
    { slug: 'upcat' },
    { slug: 'acet' },
    { slug: 'ustet' },
    { slug: 'dcat' },
  ]

  it('places focus-slug blueprints first, ordered by focus position', () => {
    const result = orderBlueprintsForUser(bps, ['ustet', 'upcat'])
    expect(result.map(b => b.slug)).toEqual(['ustet', 'upcat', 'acet', 'dcat'])
  })

  it('non-focus blueprints keep their relative (displayOrder) order', () => {
    const result = orderBlueprintsForUser(bps, ['dcat'])
    expect(result.map(b => b.slug)).toEqual(['dcat', 'upcat', 'acet', 'ustet'])
  })

  it('returns unchanged order when focusSlugs is empty', () => {
    const result = orderBlueprintsForUser(bps, [])
    expect(result.map(b => b.slug)).toEqual(['upcat', 'acet', 'ustet', 'dcat'])
  })

  it('ignores focus slugs that do not appear in blueprints', () => {
    const result = orderBlueprintsForUser(bps, ['ghost', 'acet'])
    expect(result.map(b => b.slug)).toEqual(['acet', 'upcat', 'ustet', 'dcat'])
  })

  it('does not mutate the input array', () => {
    const original = [...bps]
    orderBlueprintsForUser(bps, ['ustet'])
    expect(bps.map(b => b.slug)).toEqual(original.map(b => b.slug))
  })
})
