import { buildBlueprintExam, scoreBlueprintExam } from '../examBuilder'
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
