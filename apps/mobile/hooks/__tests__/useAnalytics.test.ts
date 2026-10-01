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

  it('counts sittings, not rows: two sections of one mock on the same subtest are one session', () => {
    const now = Date.now()
    const sessions = [
      { topicId: '', deckId: '', subtest: 'Language Proficiency', listingSlug: 'acet', score: 5, total: 10, completedAt: now, attemptKey: 42, durationSecs: 600 },
      { topicId: '', deckId: '', subtest: 'Language Proficiency', listingSlug: 'acet', score: 7, total: 10, completedAt: now + 900_000, attemptKey: 42, durationSecs: 1500 },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    expect(mastery[0]).toMatchObject({ label: 'Language Proficiency', sessionCount: 1, accuracy: 60 })
  })

  it('orders by sessionCount descending (most practiced first) within slice', () => {
    const now = Date.now()
    const sessions = [
      { topicId: '', deckId: '', subtest: 'English', listingSlug: 'upcat', score: 8, total: 10, completedAt: now },
      { topicId: '', deckId: '', subtest: 'Science', listingSlug: 'upcat', score: 7, total: 10, completedAt: now },
      { topicId: '', deckId: '', subtest: 'Science', listingSlug: 'upcat', score: 9, total: 10, completedAt: now + 60_000 },
    ]
    const mastery = computeTopicMastery(sessions as any, topicNameMap, deckMap)
    // Science has 2 sessions → should rank first
    expect(mastery[0]!.label).toBe('Science')
    expect(mastery[0]!.sessionCount).toBe(2)
  })
})

describe('Progress weighting + sittings (A7)', () => {
  const now = Date.now()

  it('computeWeeklyData weights by question count, not per-row percentage', () => {
    const bars = computeWeeklyData([
      { completedAt: now, score: 1, total: 1 },
      { completedAt: now + 1, score: 1, total: 9 },
    ])
    expect(bars[bars.length - 1]!.accuracy).toBe(20)
  })

  it('computeWeeklyData counts one mock (3 section rows) as one session', () => {
    const rows = [
      { completedAt: now, score: 5, total: 10, attemptKey: 111, durationSecs: 5 },
      { completedAt: now + 2000, score: 5, total: 10, attemptKey: 111, durationSecs: 7 },
      { completedAt: now + 4000, score: 5, total: 10, attemptKey: 111, durationSecs: 9 },
    ]
    expect(computeWeeklyData(rows)[6]!.sessionCount).toBe(1)
  })

  it('computeTopicMastery ignores onboarding pre-assess rows', () => {
    const sessions = [
      { topicId: 'pre-assess-Mathematics', deckId: '', subtest: null, kind: 'onboarding', score: 1, total: 20 },
      { topicId: 't1', deckId: '', subtest: null, kind: 'drill', score: 8, total: 10 },
    ]
    const mastery = computeTopicMastery(sessions as any, new Map([['t1', 'Algebra']]), new Map())
    expect(mastery.map(m => m.label)).toEqual(['Algebra'])
  })

  it('computeTopicMastery weights accuracy by question count', () => {
    const sessions = [
      { topicId: 't1', deckId: '', subtest: null, score: 1, total: 1 },
      { topicId: 't1', deckId: '', subtest: null, score: 1, total: 9 },
    ]
    const mastery = computeTopicMastery(sessions as any, new Map([['t1', 'Algebra']]), new Map())
    expect(mastery[0]!.accuracy).toBe(20)
  })

  it('computeTopicMastery labels a missing deck "Saved deck" and an unknown topic via resolveTopicLabel, never a raw id', () => {
    const sessions = [
      { topicId: '', deckId: 'deck-gone', subtest: null, score: 5, total: 10 },
    ]
    const mastery = computeTopicMastery(sessions as any, new Map(), new Map())
    expect(mastery[0]!.label).toBe('Saved deck')
  })

  it('useAnalytics excludes onboarding rows from counts/averages but the streak source is untouched', async () => {
    mockGetPracticeDayIndices.mockReset()
    mockGetPracticeDayIndices.mockResolvedValue([])
    mockSessionRows = [
      { id: 1, listingSlug: '', topicId: 'pre-assess-Mathematics', deckId: '', subtest: null, kind: 'onboarding', attemptKey: 1, score: 0, total: 20, durationSecs: 0, completedAt: now },
      { id: 2, listingSlug: 'upcat', topicId: 't1', deckId: '', subtest: null, kind: 'drill', attemptKey: 2, score: 8, total: 10, durationSecs: 60, completedAt: now },
      { id: 3, listingSlug: 'upcat', topicId: '', deckId: '', subtest: 'Mathematics', kind: 'mock', attemptKey: 3, score: 5, total: 10, durationSecs: 60, completedAt: now },
      { id: 4, listingSlug: 'upcat', topicId: '', deckId: '', subtest: 'Science', kind: 'mock', attemptKey: 3, score: 5, total: 10, durationSecs: 70, completedAt: now + 5000 },
    ]
    const { result } = renderHook(() => useAnalytics('overall'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.sessionCount).toBe(2) // drill + one mock sitting
    expect(result.current.avgAccuracy).toBe(60) // 18/30
    expect(result.current.recentSessions.every(s => !s.title.startsWith('Pre-Assessment'))).toBe(true)
  })
})
