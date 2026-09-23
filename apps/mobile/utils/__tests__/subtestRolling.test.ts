import { rollingSubtestAverages, type RollingSession } from '../subtestRolling'

const s = (subtest: string, score: number, total: number, completedAt: number): RollingSession => ({ subtest, score, total, completedAt })

describe('rollingSubtestAverages', () => {
  it('averages the last 3 sessions per subtest as percentages', () => {
    const sessions = [
      s('Mathematics', 6, 10, 1), s('Mathematics', 8, 10, 2), s('Mathematics', 10, 10, 3), s('Mathematics', 0, 10, 4),
    ]
    // last 3 by completedAt desc: (0,10),(10,10),(8,10) → (0+100+80)/3 = 60
    expect(rollingSubtestAverages(sessions).math).toBe(60)
  })
  it('maps the four subtest names to keys', () => {
    const sessions = [ s('Science',5,10,1), s('Language Proficiency',9,10,1), s('Reading Comprehension',7,10,1) ]
    const r = rollingSubtestAverages(sessions)
    expect(r.science).toBe(50); expect(r.language).toBe(90); expect(r.reading).toBe(70)
  })
  it('null for subtests with no sessions', () => {
    expect(rollingSubtestAverages([]).math).toBeNull()
  })
  it('averages fewer than 3 when only 1-2 exist; ignores total=0', () => {
    expect(rollingSubtestAverages([ s('Mathematics',7,10,1) ]).math).toBe(70)
    expect(rollingSubtestAverages([ s('Mathematics',1,0,1) ]).math).toBeNull()
  })
})
