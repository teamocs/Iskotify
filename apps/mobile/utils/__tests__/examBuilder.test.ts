import {
  buildBlueprintExam, scoreBlueprintExam, filterCourseNotesByClusters, scoreBand,
  groupReviewBySection, sectionChipState, orderBlueprintsForUser,
  scaleExamTimeMinutes, scaleSectionTimeMinutes, scaleBlueprintTiming,
  computeSprintItemCounts, buildStudySprintExam, STUDY_SPRINT_MINUTES, plannedItemCount,
} from '../examBuilder'
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

  it('excludes questions with has_visual=true and no image_url (figure required but missing)', () => {
    const good = q('Mathematics', 3)
    const missingFigure: RawUpcatQuestion = {
      questionId: 'Mathematics-broken', subtest: 'Mathematics', questionText: 'See diagram',
      options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', setId: null, setPosition: null,
      hasVisual: true, imageUrl: null,
    }
    const pools = new Map([['Mathematics', [...good, missingFigure]]])
    const built = buildBlueprintExam(bp({ sections: [{ id: 'x:1', name: 'Math', skillCategory: 'Mathematics', itemCount: 4, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 }] }), pools, [])
    expect(built.runnable[0]!.questions.map(x => x.questionId)).not.toContain('Mathematics-broken')
    expect(built.runnable[0]!.available).toBe(3)
  })

  it('treats a section as comingSoon when every question in its pool is missing a required figure', () => {
    const missingFigure: RawUpcatQuestion = {
      questionId: 'Mathematics-broken', subtest: 'Mathematics', questionText: 'See diagram',
      options: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: '', setId: null, setPosition: null,
      hasVisual: true, imageUrl: null,
    }
    const pools = new Map([['Mathematics', [missingFigure]]])
    const built = buildBlueprintExam(bp(), pools, [])
    expect(built.runnable.map(s => s.section.name)).not.toContain('Math')
    expect(built.comingSoon.map(s => s.name)).toContain('Math')
  })
})

// ---------------------------------------------------------------------------
// Timer scaling (Task 4)
// ---------------------------------------------------------------------------

describe('scaleExamTimeMinutes', () => {
  it('keeps the declared time when the sampled total meets or exceeds the declared total', () => {
    expect(scaleExamTimeMinutes(270, 245, 245)).toBe(270)
    expect(scaleExamTimeMinutes(270, 300, 245)).toBe(270) // over-supplied pool never scales up
  })

  it('scales proportionally when the sampled total is short of the declared total', () => {
    // 270 * 100/245 = 110.2 -> 110
    expect(scaleExamTimeMinutes(270, 100, 245)).toBe(110)
  })

  it('never returns less than 1 minute', () => {
    expect(scaleExamTimeMinutes(270, 1, 2450)).toBe(1)
  })

  it('falls back to the declared time when declaredTotal is 0 (guards divide-by-zero)', () => {
    expect(scaleExamTimeMinutes(270, 0, 0)).toBe(270)
  })
})

describe('scaleSectionTimeMinutes', () => {
  it('returns null when the section has no declared time budget', () => {
    expect(scaleSectionTimeMinutes(null, 5, 10)).toBeNull()
  })

  it('keeps the declared section time when sampled meets/exceeds declared', () => {
    expect(scaleSectionTimeMinutes(90, 90, 90)).toBe(90)
    expect(scaleSectionTimeMinutes(90, 100, 90)).toBe(90)
  })

  it('scales proportionally when under-sampled', () => {
    // 90 * 30/90 = 30
    expect(scaleSectionTimeMinutes(90, 30, 90)).toBe(30)
  })

  it('never returns less than 1 minute', () => {
    expect(scaleSectionTimeMinutes(90, 1, 900)).toBe(1)
  })

  it('guards divide-by-zero on a zero declared count', () => {
    expect(scaleSectionTimeMinutes(90, 5, 0)).toBe(90)
  })
})

describe('scaleBlueprintTiming', () => {
  const blueprint = { totalItems: 245, totalTimeMinutes: 270 }
  const built = {
    runnable: [
      { section: { id: 'acet:1', name: 'Verbal', skillCategory: 'English/Language', itemCount: 90, timeMinutes: 90, requiresSpatialLogic: false, displayOrder: 1 }, questions: new Array(45).fill({}), available: 45 },
      { section: { id: 'acet:2', name: 'Numerical', skillCategory: 'Mathematics', itemCount: 60, timeMinutes: 75, requiresSpatialLogic: false, displayOrder: 2 }, questions: new Array(60).fill({}), available: 60 },
    ],
    comingSoon: [],
    totalQuestions: 105,
  }

  it('scales the total time by sampled / SUM of section item_counts (blueprint.totalItems is ignored)', () => {
    // declared = 90 + 60 = 150 (not totalItems 245); 270 * 105/150 = 189
    expect(scaleBlueprintTiming(blueprint, built).totalMinutes).toBe(189)
  })

  it('B3: a stale/wrong blueprint.totalItems cannot change the timer (DOST-SEI: total_items 170, sections sum 210)', () => {
    const dost = {
      runnable: [
        { section: { id: 'd:1', name: 'A', skillCategory: 'a', itemCount: 105, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 }, questions: new Array(100).fill({}), available: 100 },
        { section: { id: 'd:2', name: 'B', skillCategory: 'b', itemCount: 105, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 2 }, questions: new Array(100).fill({}), available: 100 },
      ],
      comingSoon: [],
      totalQuestions: 200,
    }
    // sampled 200 >= totalItems 170 used to mean "no scaling"; vs the real 210 it is 200/210.
    expect(scaleBlueprintTiming({ totalItems: 170, totalTimeMinutes: 210 }, dost).totalMinutes).toBe(200)
  })

  describe('section-blocked blueprints (B3)', () => {
    const sec = (id: string, itemCount: number, timeMinutes: number | null) =>
      ({ id, name: id, skillCategory: id, itemCount, timeMinutes, requiresSpatialLogic: false, displayOrder: 1 })
    const run = (section: ReturnType<typeof sec>, n: number) => ({ section, questions: new Array(n).fill({}), available: n })

    it('total is never shorter than the sum of the runnable section clocks', () => {
      // sections sum to 190 min but the blueprint says 180
      const b = { runnable: [run(sec('a', 50, 100), 50), run(sec('b', 50, 90), 50)], comingSoon: [], totalQuestions: 100 }
      const t = scaleBlueprintTiming({ totalItems: 100, totalTimeMinutes: 180, sectionBlocked: true }, b)
      expect(t.totalMinutes).toBe(190)
    })

    it('with a coming-soon section dropped, total = sum of the scaled runnable sections', () => {
      const b = {
        runnable: [run(sec('a', 100, 60), 50), run(sec('b', 100, 60), 100)],
        comingSoon: [sec('c', 100, 60)],
        totalQuestions: 150,
      }
      const t = scaleBlueprintTiming({ totalItems: 300, totalTimeMinutes: 180, sectionBlocked: true }, b)
      expect(t.sectionMinutes.get('a')).toBe(30)
      expect(t.sectionMinutes.get('b')).toBe(60)
      expect(t.totalMinutes).toBe(90)
    })

    it('a section with no declared minutes gets an equal share of the remaining total', () => {
      // total 100, a=40 declared => 60 remain for the two null sections => 30 each
      const b = { runnable: [run(sec('a', 10, 40), 10), run(sec('b', 10, null), 10), run(sec('c', 10, null), 10)], comingSoon: [], totalQuestions: 30 }
      const t = scaleBlueprintTiming({ totalItems: 30, totalTimeMinutes: 100, sectionBlocked: true }, b)
      expect(t.sectionMinutes.get('a')).toBe(40)
      expect(t.sectionMinutes.get('b')).toBe(30)
      expect(t.sectionMinutes.get('c')).toBe(30)
      expect(t.totalMinutes).toBe(100)
    })
  })

  describe('null-minutes share when declared minutes use up the total (item 5)', () => {
    const sec = (id: string, itemCount: number, timeMinutes: number | null) =>
      ({ id, name: id, skillCategory: id, itemCount, timeMinutes, requiresSpatialLogic: false, displayOrder: 1 })
    const run = (section: ReturnType<typeof sec>, n: number) => ({ section, questions: new Array(n).fill({}), available: n })

    it('falls back to the item-proportional share of the total instead of flooring to 1 minute', () => {
      // a declares 100 of a 60-minute total, so nothing is "left"; b has 10 of 60 items => 10 min.
      const b = { runnable: [run(sec('a', 50, 100), 50), run(sec('b', 10, null), 10)], comingSoon: [], totalQuestions: 60 }
      const t = scaleBlueprintTiming({ totalItems: 60, totalTimeMinutes: 60, sectionBlocked: true }, b)
      expect(t.sectionMinutes.get('b')).toBe(10)
    })

    it('never gives a section less than 1 minute per 2 questions', () => {
      // total 20 min, a declares 20, b has 30 of 130 items => proportional 4.6, floor 15.
      const b = { runnable: [run(sec('a', 100, 20), 100), run(sec('b', 30, null), 30)], comingSoon: [], totalQuestions: 130 }
      const t = scaleBlueprintTiming({ totalItems: 130, totalTimeMinutes: 20, sectionBlocked: true }, b)
      expect(t.sectionMinutes.get('b')).toBe(15)
    })

    it('a tiny positive remainder is also lifted to the floor', () => {
      const b = { runnable: [run(sec('a', 10, 59), 10), run(sec('b', 10, null), 10)], comingSoon: [], totalQuestions: 20 }
      const t = scaleBlueprintTiming({ totalItems: 20, totalTimeMinutes: 60, sectionBlocked: true }, b)
      expect(t.sectionMinutes.get('b')).toBe(5)
    })
  })

  it('scales each section using its OWN sampled/declared ratio, not the blueprint-wide one', () => {
    const timing = scaleBlueprintTiming(blueprint, built)
    // acet:1 sampled 45/90 -> 90*45/90 = 45
    expect(timing.sectionMinutes.get('acet:1')).toBe(45)
    // acet:2 fully sampled 60/60 -> unchanged
    expect(timing.sectionMinutes.get('acet:2')).toBe(75)
  })
})

// ---------------------------------------------------------------------------
// Study Sprint sampling (Task 4)
// ---------------------------------------------------------------------------

describe('computeSprintItemCounts', () => {
  it('scales each section item_count proportionally to the sprint budget', () => {
    const sections = [{ id: 'a', itemCount: 90 }, { id: 'b', itemCount: 60 }, { id: 'c', itemCount: 30 }]
    // totalTimeMinutes 180, sprint 30 -> ratio 1/6
    const counts = computeSprintItemCounts(sections, 180, 30)
    expect(counts.get('a')).toBe(15) // 90/6
    expect(counts.get('b')).toBe(10) // 60/6
    expect(counts.get('c')).toBe(5)  // 30/6
  })

  it('never returns less than 1', () => {
    const sections = [{ id: 'a', itemCount: 2 }]
    const counts = computeSprintItemCounts(sections, 270, 30)
    expect(counts.get('a')).toBe(1) // round(2*30/270) = round(0.22) = 0 -> clamped to 1
  })

  it('defaults sprintMinutes to STUDY_SPRINT_MINUTES (30)', () => {
    const sections = [{ id: 'a', itemCount: 90 }]
    expect(computeSprintItemCounts(sections, 90).get('a')).toBe(STUDY_SPRINT_MINUTES)
  })

  it('falls back to the full item_count when totalTimeMinutes is 0 (guards divide-by-zero)', () => {
    const sections = [{ id: 'a', itemCount: 40 }]
    expect(computeSprintItemCounts(sections, 0).get('a')).toBe(40)
  })
})

describe('buildStudySprintExam', () => {
  it('samples a proportionally smaller subset per section than the full mock', () => {
    const pools = new Map<string, RawUpcatQuestion[]>([
      ['Mathematics', q('Mathematics', 100)],
      ['Abstract/Non-Verbal Reasoning', q('Abstract', 100)],
    ])
    const blueprint = bp({ totalTimeMinutes: 60, sections: [
      { id: 'x:1', name: 'Math', skillCategory: 'Mathematics', itemCount: 30, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
      { id: 'x:2', name: 'Abstract', skillCategory: 'Abstract/Non-Verbal Reasoning', itemCount: 20, timeMinutes: null, requiresSpatialLogic: true, displayOrder: 2 },
    ] })
    const sprint = buildStudySprintExam(blueprint, pools, [], 30)
    // Math: round(30*30/60)=15, Abstract: round(20*30/60)=10
    expect(sprint.runnable.find(s => s.section.name === 'Math')!.questions).toHaveLength(15)
    expect(sprint.runnable.find(s => s.section.name === 'Abstract')!.questions).toHaveLength(10)
    expect(sprint.totalQuestions).toBe(25)
  })

  it('still excludes sections with an empty pool as comingSoon', () => {
    const pools = new Map<string, RawUpcatQuestion[]>([['Mathematics', q('Mathematics', 100)]])
    const sprint = buildStudySprintExam(bp(), pools, [])
    expect(sprint.comingSoon.map(s => s.name)).toEqual(['Abstract'])
  })
})

describe('buildBlueprintExam with itemCountFor override', () => {
  it('uses the override instead of the section declared item_count when provided', () => {
    const pools = new Map<string, RawUpcatQuestion[]>([['Mathematics', q('Mathematics', 100)]])
    const built = buildBlueprintExam(bp(), pools, [], () => 1)
    expect(built.runnable[0]!.questions).toHaveLength(1)
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

// Fix 3 (exam safety): estimatePercentileBand's `percentile` field was raw %
// correct dressed up as a percentile — it drove "Below cut-off (need Nth)"
// verdict pills that look like a normed qualification score but aren't.
// scoreBand() keeps only the descriptive, non-judgemental band + blurb.
describe('scoreBand', () => {
  it('clamps and labels tiers', () => {
    expect(scoreBand(95).band).toBe('Top tier')
    expect(scoreBand(80).band).toBe('Competitive')
    expect(scoreBand(60).band).toBe('Developing')
    expect(scoreBand(20).band).toBe('Foundational')
  })
  it('handles out-of-range pct without throwing (clamped internally, no percentile exposed)', () => {
    expect(scoreBand(150).band).toBe('Top tier')
    expect(scoreBand(-5).band).toBe('Foundational')
  })
  it('never exposes a percentile field', () => {
    expect(scoreBand(73)).not.toHaveProperty('percentile')
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

// ---------------------------------------------------------------------------
// Batch B — B2: passage sets stay whole + contiguous; B-extra: no id in two sections
// ---------------------------------------------------------------------------

function setQs(setId: string, n: number): RawUpcatQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    // setPosition deliberately reversed vs array order so sorting is observable.
    questionId: `${setId}-${i}`, subtest: 'Reading Comprehension', questionText: `${setId} Q${i}`, options: ['a', 'b', 'c', 'd'],
    correctIndex: 0, explanation: '', setId, setPosition: n - i,
  }))
}
const oneSection = (itemCount: number, skillCategory = 'Reading'): ExamBlueprint =>
  bp({ sections: [{ id: 'x:1', name: 'RC', skillCategory, itemCount, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 }] })

describe('buildBlueprintExam: passage sets (B2)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('keeps every picked passage set whole, contiguous and ordered by setPosition', () => {
    const pool = [...setQs('s1', 4), ...setQs('s2', 4), ...q('Reading', 6)]
    const passages = [{ setId: 's1', subtest: 'RC', passageText: 'P1' }, { setId: 's2', subtest: 'RC', passageText: 'P2' }]
    for (let seed = 0; seed < 30; seed++) {
      let n = seed + 1
      jest.spyOn(Math, 'random').mockImplementation(() => { n = (n * 9301 + 49297) % 233280; return n / 233280 })
      const built = buildBlueprintExam(oneSection(8), new Map([['Reading', pool]]), passages)
      const qs = built.runnable[0]!.questions
      for (const sid of ['s1', 's2']) {
        const at = qs.map((x, i) => (x.setId === sid ? i : -1)).filter(i => i >= 0)
        if (at.length === 0) continue
        expect(at).toHaveLength(4) // never a truncated set
        expect(at[3]! - at[0]!).toBe(3) // contiguous
        expect(at.map(i => qs[i]!.setPosition)).toEqual([1, 2, 3, 4]) // sorted by setPosition
        expect(qs[at[0]!]!.passageText).toBe(sid === 's1' ? 'P1' : 'P2')
      }
      jest.restoreAllMocks()
    }
  })

  it('takes a whole set that is larger than the target rather than truncating it', () => {
    const built = buildBlueprintExam(oneSection(3), new Map([['Reading', setQs('s1', 5)]]), [])
    expect(built.runnable[0]!.questions).toHaveLength(5)
    expect(new Set(built.runnable[0]!.questions.map(x => x.setId))).toEqual(new Set(['s1']))
  })

  it('does not overshoot the target when whole units can fill it exactly', () => {
    const pool = [...setQs('s1', 5), ...q('Reading', 10)]
    for (let i = 0; i < 20; i++) {
      const built = buildBlueprintExam(oneSection(3), new Map([['Reading', pool]]), [])
      expect(built.runnable[0]!.questions).toHaveLength(3)
    }
  })
})

describe('buildBlueprintExam: no question in two sections', () => {
  it('never reuses a questionId across sections that share a category', () => {
    const two = bp({ sections: [
      { id: 'x:1', name: 'A', skillCategory: 'Mathematics', itemCount: 3, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
      { id: 'x:2', name: 'B', skillCategory: 'Mathematics', itemCount: 3, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 2 },
    ] })
    const built = buildBlueprintExam(two, new Map([['Mathematics', q('Mathematics', 4)]]), [])
    const ids = built.runnable.flatMap(s => s.questions.map(x => x.questionId))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(4)
  })

  it('a later section whose whole pool was consumed becomes comingSoon', () => {
    const two = bp({ sections: [
      { id: 'x:1', name: 'A', skillCategory: 'Mathematics', itemCount: 5, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
      { id: 'x:2', name: 'B', skillCategory: 'Mathematics', itemCount: 3, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 2 },
    ] })
    const built = buildBlueprintExam(two, new Map([['Mathematics', q('Mathematics', 4)]]), [])
    expect(built.runnable.map(s => s.section.name)).toEqual(['A'])
    expect(built.comingSoon.map(s => s.name)).toEqual(['B'])
  })
})

describe('plannedItemCount (what the prestart will build, from counts alone)', () => {
  const s = (id: string, skillCategory: string, itemCount: number, displayOrder: number) =>
    ({ id, name: id, skillCategory, itemCount, timeMinutes: null, requiresSpatialLogic: false, displayOrder })

  it('sums min(item_count, available) over sections, leaving empty sections out', () => {
    const sections = [s('a', 'M', 50, 1), s('b', 'S', 30, 2), s('c', 'V', 20, 3)]
    expect(plannedItemCount(sections, new Map([['M', 10], ['S', 100]]))).toBe(10 + 30) // V has nothing
  })

  it('sections sharing a category draw from one pool, in display order, never twice', () => {
    const sections = [s('b', 'M', 110, 2), s('a', 'M', 100, 1)]
    expect(plannedItemCount(sections, new Map([['M', 150]]))).toBe(150) // a takes 100, b only 50 left
    expect(plannedItemCount(sections, new Map([['M', 500]]))).toBe(210)
  })

  it('matches buildBlueprintExam for the same pools', () => {
    const pools = new Map([['Mathematics', q('Mathematics', 4)], ['Abstract/Non-Verbal Reasoning', q('Abstract', 1)]])
    const built = buildBlueprintExam(bp(), pools, [])
    const counts = new Map([...pools].map(([k, v]) => [k, v.length] as [string, number]))
    expect(plannedItemCount(bp().sections, counts)).toBe(built.totalQuestions)
  })
})
