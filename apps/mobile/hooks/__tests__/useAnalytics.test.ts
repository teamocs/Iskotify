import { computeStreak, computeWeeklyData } from '../useAnalytics'

describe('computeStreak', () => {
  it('returns 0 for no sessions', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for a session today only', () => {
    expect(computeStreak([{ completedAt: Date.now() }])).toBe(1)
  })

  it('counts 3 consecutive days', () => {
    const day = 86_400_000
    const now = Date.now()
    const sessions = [
      { completedAt: now },
      { completedAt: now - day },
      { completedAt: now - 2 * day },
    ]
    expect(computeStreak(sessions)).toBe(3)
  })

  it('breaks at a gap', () => {
    const day = 86_400_000
    const now = Date.now()
    const sessions = [
      { completedAt: now },
      { completedAt: now - 3 * day },
    ]
    expect(computeStreak(sessions)).toBe(1)
  })

  it('returns 0 when only yesterday has a session', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12, 0, 0, 0)
    expect(computeStreak([{ completedAt: yesterday.getTime() }])).toBe(0)
  })
})

describe('computeWeeklyData', () => {
  it('always returns exactly 7 entries', () => {
    expect(computeWeeklyData([])).toHaveLength(7)
  })

  it('returns null accuracy when no sessions on any day', () => {
    const bars = computeWeeklyData([])
    expect(bars.every(b => b.accuracy === null)).toBe(true)
  })

  it('computes accuracy for today correctly', () => {
    const sessions = [{ completedAt: Date.now(), score: 8, total: 10 }]
    const bars = computeWeeklyData(sessions)
    const today = bars[bars.length - 1]!
    expect(today.accuracy).toBe(80)
    expect(today.sessionCount).toBe(1)
  })

  it('ignores sessions with total=0 to avoid division errors', () => {
    const sessions = [{ completedAt: Date.now(), score: 0, total: 0 }]
    const bars = computeWeeklyData(sessions)
    expect(bars[bars.length - 1]!.accuracy).toBeNull()
  })
})
