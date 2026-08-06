import { renderHook, waitFor } from '@testing-library/react-native'
import { computeWeeklyData, computeTopicMastery, useAnalytics } from '../useAnalytics'
import { practiceSessions } from '../../db/schema'

// ── Hook-level mocks (streak wiring test) ─────────────────────────────────────

jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    const React = require('react')
    React.useEffect(cb, [cb])
  },
}))

jest.mock('../../services/queryCache', () => ({
  cachedQuery: (_key: string, _ttl: number, fetcher: () => Promise<unknown>) => fetcher(),
  subscribe: () => () => {},
}))

const mockGetPracticeDayIndices = jest.fn<Promise<number[]>, unknown[]>()
jest.mock('../../services/homeAggregates', () => ({
  getPracticeDayIndices: (...args: unknown[]) => mockGetPracticeDayIndices(...args),
}))

// Minimal drizzle stand-in: db.select(...).from(table) resolves to seeded rows.
let mockSessionRows: any[] = []
const mockDb = {
  select: (_cols?: unknown) => ({
    from: (tbl: unknown) =>
      Promise.resolve(tbl === practiceSessions ? mockSessionRows : []),
  }),
}
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

// The old session-only computeStreak was removed: streak now comes from
// getPracticeDayIndices (UNION of user_progress + practice_sessions) +
// computeStreakFromDays — same source as the Home streak.
describe('useAnalytics streak — shared union day-indices source', () => {
  beforeEach(() => {
    mockGetPracticeDayIndices.mockReset()
    mockSessionRows = []
  })

  it('counts a user_progress-only day (flashcard reviews) toward the streak', async () => {
    const offset = -new Date().getTimezoneOffset() * 60_000
    const todayIdx = Math.floor((Date.now() + offset) / 86_400_000)
    // Union helper reports today (session) AND yesterday (flashcard-review-only day
    // that exists only in user_progress) — sessions table alone only covers today.
    mockGetPracticeDayIndices.mockResolvedValue([todayIdx, todayIdx - 1])
    mockSessionRows = [{
      id: 1, listingSlug: 'upcat', topicId: 't1', deckId: '', subtest: null,
      score: 8, total: 10, durationSecs: 60, completedAt: Date.now(),
    }]

    const { result } = renderHook(() => useAnalytics('overall'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.streak).toBe(2)
    expect(mockGetPracticeDayIndices).toHaveBeenCalledWith(expect.anything(), offset)
  })

  it('per-listing dashboards show the same global streak (intended)', async () => {
    const offset = -new Date().getTimezoneOffset() * 60_000
    const todayIdx = Math.floor((Date.now() + offset) / 86_400_000)
    mockGetPracticeDayIndices.mockResolvedValue([todayIdx])
    mockSessionRows = [] // no sessions for this listing at all

    const { result } = renderHook(() => useAnalytics('some-other-listing'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.streak).toBe(1)
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

describe('computeTopicMastery', () => {
  const topicNameMap = new Map([['t1', 'Algebra']])
  const deckMap = new Map([['deck-1', 'My Saved Deck']])

  it('groups a topic-backed session by topicId', () => {
    const sessions = [
      { topicId: 't1', deckId: '', subtest: null, listingSlug: '', score: 8, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery.some(m => m.label === 'Algebra')).toBe(true)
    const alg = mastery.find(m => m.label === 'Algebra')!
    expect(alg.accuracy).toBe(80)
    expect(alg.sessionCount).toBe(1)
  })

  it('groups an upcat subtest session (shape b) by subtest key', () => {
    const sessions = [
      { topicId: '', deckId: '', subtest: 'Mathematics', listingSlug: 'upcat', score: 6, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery.some(m => m.label === 'Mathematics')).toBe(true)
    const math = mastery.find(m => m.label === 'Mathematics')!
    expect(math.accuracy).toBe(60)
  })

  it('groups a non-upcat subtest session (shape c) by subtest key', () => {
    const sessions = [
      { topicId: '', deckId: '', subtest: 'Reading Comprehension', listingSlug: 'ustet', score: 7, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery.some(m => m.label === 'Reading Comprehension')).toBe(true)
  })

  it('groups all three shapes simultaneously with correct accuracy', () => {
    const sessions = [
      { topicId: 't1', deckId: '', subtest: null, listingSlug: '', score: 8, total: 10, completedAt: Date.now() },
      { topicId: '', deckId: '', subtest: 'Mathematics', listingSlug: 'upcat', score: 5, total: 10, completedAt: Date.now() },
      { topicId: '', deckId: '', subtest: 'Reading Comprehension', listingSlug: 'ustet', score: 9, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    const labels = mastery.map(m => m.label)
    expect(labels).toContain('Algebra')
    expect(labels).toContain('Mathematics')
    expect(labels).toContain('Reading Comprehension')

    const math = mastery.find(m => m.label === 'Mathematics')!
    expect(math.accuracy).toBe(50)

    const rc = mastery.find(m => m.label === 'Reading Comprehension')!
    expect(rc.accuracy).toBe(90)
  })

  it('skips __full__, __weak__, and __due__ sentinel deckIds', () => {
    const sessions = [
      { topicId: '', deckId: '__full__', subtest: null, listingSlug: '', score: 5, total: 10, completedAt: Date.now() },
      { topicId: '', deckId: '__weak__', subtest: null, listingSlug: '', score: 3, total: 10, completedAt: Date.now() },
      { topicId: '', deckId: '__due__', subtest: null, listingSlug: '', score: 4, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery).toHaveLength(0)
  })

  it('skips sessions with empty key (no topicId, deckId, or subtest)', () => {
    const sessions = [
      { topicId: '', deckId: '', subtest: null, listingSlug: '', score: 5, total: 10, completedAt: Date.now() },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery).toHaveLength(0)
  })

  it('orders by sessionCount descending (most practiced first) within slice', () => {
    const now = Date.now()
    const sessions = [
      { topicId: '', deckId: '', subtest: 'English', listingSlug: 'upcat', score: 8, total: 10, completedAt: now },
      { topicId: '', deckId: '', subtest: 'Science', listingSlug: 'upcat', score: 7, total: 10, completedAt: now },
      { topicId: '', deckId: '', subtest: 'Science', listingSlug: 'upcat', score: 9, total: 10, completedAt: now },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    // Science has 2 sessions → should rank first
    expect(mastery[0]!.label).toBe('Science')
    expect(mastery[0]!.sessionCount).toBe(2)
  })
})
