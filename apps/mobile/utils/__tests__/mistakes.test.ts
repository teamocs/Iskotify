import { openMistakeIds, buildMistakesExam, MISTAKES_SESSION_SIZE } from '../mistakes'
import type { RawUpcatQuestion } from '../upcatExam'

const a = (questionId: string, answeredAt: number, correct: boolean) => ({ questionId, answeredAt, correct })

describe('openMistakeIds', () => {
  it('keeps questions whose latest answered attempt is wrong, newest mistake first', () => {
    const rows = [
      a('q1', 100, false),
      a('q2', 300, false),
      a('q3', 200, false),
      a('q3', 250, true), // fixed since: gone
      a('q4', 50, true),
      a('q4', 400, false), // wrong again after being right: back in
      a('q5', 10, true), // only ever right
    ]
    expect(openMistakeIds(rows)).toEqual(['q4', 'q2', 'q1'])
  })

  it('a correct answer at the same moment as a wrong one counts as fixed', () => {
    expect(openMistakeIds([a('q1', 100, false), a('q1', 100, true)])).toEqual([])
  })

  it('orders by the latest wrong answer when a question was missed more than once', () => {
    expect(openMistakeIds([a('q1', 100, false), a('q2', 150, false), a('q1', 200, false)])).toEqual(['q1', 'q2'])
  })

  it('never includes onboarding pre-assessment ids', () => {
    expect(openMistakeIds([a('pre-assess-1', 100, false), a('pre-x', 90, false), a('q1', 80, false)])).toEqual(['q1'])
  })
})

function q(questionId: string, over: Partial<RawUpcatQuestion> = {}): RawUpcatQuestion {
  return {
    questionId, subtest: 'Mathematics', questionText: questionId, options: ['a', 'b', 'c', 'd'],
    correctIndex: 0, explanation: '', setId: null, setPosition: null, ...over,
  }
}
const rc = (questionId: string, setId: string, setPosition: number) =>
  q(questionId, { subtest: 'Reading Comprehension', setId, setPosition })

describe('buildMistakesExam', () => {
  it('serves mistakes newest first and marks exactly the mistakes', () => {
    const pool = [q('a'), q('b'), q('c'), q('d')]
    const out = buildMistakesExam(pool, [], ['c', 'a'])
    expect(out.questions.map(x => x.questionId)).toEqual(['c', 'a'])
    expect([...out.mistakeIds]).toEqual(['c', 'a'])
  })

  it('serves the whole passage set (sorted, with its passage) but counts only the missed members', () => {
    const pool = [rc('r3', 'S1', 3), rc('r1', 'S1', 1), rc('r2', 'S1', 2), q('m1')]
    const passages = [{ setId: 'S1', subtest: 'Reading Comprehension', passageText: 'The passage' }]
    const out = buildMistakesExam(pool, passages, ['m1', 'r2'])
    expect(out.questions.map(x => x.questionId)).toEqual(['m1', 'r1', 'r2', 'r3'])
    expect(out.questions[1]!.passageText).toBe('The passage')
    expect(out.questions[0]!.passageText).toBeNull()
    expect(out.mistakeIds).toEqual(new Set(['m1', 'r2']))
  })

  it('emits a passage set once when several of its members were missed', () => {
    const pool = [rc('r1', 'S1', 1), rc('r2', 'S1', 2)]
    const out = buildMistakesExam(pool, [], ['r2', 'r1'])
    expect(out.questions.map(x => x.questionId)).toEqual(['r1', 'r2'])
    expect(out.mistakeIds.size).toBe(2)
  })

  it(`caps at ${MISTAKES_SESSION_SIZE} mistakes (passage members that were not missed do not count)`, () => {
    const singles = Array.from({ length: 25 }, (_, i) => q(`m${i}`))
    const set = [rc('r1', 'S1', 1), rc('r2', 'S1', 2), rc('r3', 'S1', 3)]
    const ids = ['r1', ...singles.map(s => s.questionId)]
    const out = buildMistakesExam([...set, ...singles], [], ids)
    expect(out.mistakeIds.size).toBe(MISTAKES_SESSION_SIZE)
    expect(out.questions).toHaveLength(MISTAKES_SESSION_SIZE + 2) // r2, r3 ride along with r1
    expect(out.questions.slice(0, 3).map(x => x.questionId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('skips ids no longer in the published pool and questions missing a required figure', () => {
    const pool = [q('a'), q('fig', { hasVisual: true, imageUrl: null })]
    const out = buildMistakesExam(pool, [], ['gone', 'fig', 'a'])
    expect(out.questions.map(x => x.questionId)).toEqual(['a'])
    expect([...out.mistakeIds]).toEqual(['a'])
  })

  it('is empty when there are no mistakes', () => {
    expect(buildMistakesExam([q('a')], [], [])).toEqual({ questions: [], mistakeIds: new Set() })
  })
})
