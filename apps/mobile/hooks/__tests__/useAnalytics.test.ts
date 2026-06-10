import { computeStreak, computeWeeklyData, computeTopicMastery } from '../useAnalytics'

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
    // Pin Date.now() to a fixed noon UTC to avoid midnight boundary flakiness
    const now = new Date('2024-06-15T12:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const yesterdayNoon = now - 86_400_000
    try {
      expect(computeStreak([{ completedAt: yesterdayNoon }])).toBe(0)
    } finally {
      jest.restoreAllMocks()
    }
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

  it('skips __full__ and __weak__ sentinel deckIds', () => {
    const sessions = [
      { topicId: '', deckId: '__full__', subtest: null, listingSlug: '', score: 5, total: 10, completedAt: Date.now() },
      { topicId: '', deckId: '__weak__', subtest: null, listingSlug: '', score: 3, total: 10, completedAt: Date.now() },
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
