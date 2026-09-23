import { subtestReadiness, MIN_ANSWERS, WINDOW, UPCAT_SUBTEST_LABELS } from '../subtestReadiness'

function attempts(subtest: string, correctFlags: boolean[], start = 1000) {
  return correctFlags.map((correct, i) => ({ subtest, correct, answeredAt: start + i }))
}

const n = (k: number, correctEvery = 2) => Array.from({ length: k }, (_, i) => i % correctEvery === 0)

describe('subtestReadiness', () => {
  it('reports percent correct per UPCAT subtest from the most recent answers', () => {
    const r = subtestReadiness([
      ...attempts('Mathematics', n(30)),       // 15/30
      ...attempts('Science', n(20, 1)),        // 20/20
      ...attempts('Language Proficiency', n(25, 5)),
      ...attempts('Reading Comprehension', n(40, 4)),
    ])
    expect(r.math).toEqual({ percent: 50, answered: 30, needed: 0 })
    expect(r.science).toEqual({ percent: 100, answered: 20, needed: 0 })
    expect(r.ready).toBe(true)
  })

  it(`needs at least ${MIN_ANSWERS} answers in a subtest before it counts — no stand-in average`, () => {
    const r = subtestReadiness([
      ...attempts('Mathematics', n(30)),
      ...attempts('Science', n(MIN_ANSWERS - 5)),
      ...attempts('Language Proficiency', n(30)),
      ...attempts('Reading Comprehension', n(30)),
    ])
    expect(r.science).toEqual({ percent: null, answered: MIN_ANSWERS - 5, needed: 5 })
    expect(r.ready).toBe(false)
  })

  it(`only uses the latest ${WINDOW} answers per subtest, so recent progress shows`, () => {
    const old = attempts('Mathematics', Array(WINDOW).fill(false), 0)
    const recent = attempts('Mathematics', Array(WINDOW).fill(true), 10_000)
    const r = subtestReadiness([...recent, ...old]) // order-independent
    expect(r.math.percent).toBe(100)
    expect(r.math.answered).toBe(WINDOW)
  })

  it('exports the four UPCAT subtest labels for callers that need to pre-filter a query', () => {
    expect(UPCAT_SUBTEST_LABELS.slice().sort()).toEqual(
      ['Language Proficiency', 'Mathematics', 'Reading Comprehension', 'Science'].sort(),
    )
  })

  it('ignores attempts with no or a non-UPCAT subtest', () => {
    const r = subtestReadiness([
      ...attempts('General Information', n(50)),
      ...attempts('', n(50)),
      { subtest: null, correct: true, answeredAt: 1 },
    ])
    expect(r.math).toEqual({ percent: null, answered: 0, needed: MIN_ANSWERS })
    expect(r.ready).toBe(false)
  })
})
