import { computeStreak, computeStreakFromDays, computeTodayAccuracy, computeWeakTopics, localDayOffsetMs } from '../useHomeStats'

const DAY = 86_400_000
const HOUR = 3_600_000

describe('computeStreak', () => {
  it('returns 0 with no progress', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for a single entry today', () => {
    expect(computeStreak([{ answeredAt: Date.now() }])).toBe(1)
  })

  it('counts consecutive days backward from today', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today },
      { answeredAt: today - DAY },
      { answeredAt: today - 2 * DAY },
    ])).toBe(3)
  })

  it('breaks on a missing day', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today },
      { answeredAt: today - 2 * DAY }, // gap: today - DAY missing
    ])).toBe(1)
  })

  it('starts from yesterday if today has no entries', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today - DAY },
      { answeredAt: today - 2 * DAY },
    ])).toBe(2)
  })
})

describe('computeStreakFromDays — offsetMs local-day bucketing', () => {
  afterEach(() => jest.restoreAllMocks())

  it('counts a streak using local "today" when offsetMs is provided (early-morning PH case)', () => {
    // 2024-06-15T17:00:00Z = 01:00 on June 16 in UTC+8 (PH).
    // UTC "today" is still June 15, but local today is June 16.
    const now = new Date('2024-06-15T17:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const phOffset = 8 * HOUR
    const localToday = Math.floor((now + phOffset) / DAY) // June 16 local-day index

    expect(computeStreakFromDays([localToday], phOffset)).toBe(1)
    expect(computeStreakFromDays([localToday, localToday - 1, localToday - 2], phOffset)).toBe(3)
  })

  it('defaults to offset 0 — backward compatible with UTC day buckets', () => {
    const now = new Date('2024-06-15T12:00:00.000Z').getTime()
    jest.spyOn(Date, 'now').mockReturnValue(now)
    const utcToday = Math.floor(now / DAY)
    expect(computeStreakFromDays([utcToday, utcToday - 1])).toBe(2)
  })
})

describe('localDayOffsetMs', () => {
  it('returns the negated device timezone offset in milliseconds', () => {
    expect(localDayOffsetMs()).toBe(-new Date().getTimezoneOffset() * 60_000)
  })
})

describe('computeTodayAccuracy', () => {
  it('returns null with no rows', () => {
    expect(computeTodayAccuracy([])).toBeNull()
  })

  it('returns 100 when all correct', () => {
    expect(computeTodayAccuracy([{ correct: true }, { correct: true }])).toBe(100)
  })

  it('returns 50 when half correct', () => {
    expect(computeTodayAccuracy([{ correct: true }, { correct: false }])).toBe(50)
  })

  it('handles SQLite numeric 0/1', () => {
    expect(computeTodayAccuracy([{ correct: 1 }, { correct: 0 }])).toBe(50)
  })
})

describe('computeWeakTopics', () => {
  const fcList = [
    { id: 'fc1', topicId: 't1' },
    { id: 'fc2', topicId: 't1' },
    { id: 'fc3', topicId: 't2' },
  ]
  const topicList = [
    { id: 't1', name: 'Algebra' },
    { id: 't2', name: 'Biology' },
  ]

  it('returns empty array with no progress', () => {
    expect(computeWeakTopics([], fcList, topicList)).toEqual([])
  })

  it('returns topics with accuracy < 60', () => {
    const progress = [
      { flashcardId: 'fc1', correct: false },
      { flashcardId: 'fc2', correct: false },
    ]
    const result = computeWeakTopics(progress, fcList, topicList)
    expect(result).toHaveLength(1)
    const topic = result[0]!
    expect(topic.topicId).toBe('t1')
    expect(topic.accuracy).toBe(0)
    expect(topic.topicName).toBe('Algebra')
  })

  it('excludes topics with accuracy >= 60', () => {
    const progress = [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: true },
    ]
    expect(computeWeakTopics(progress, fcList, topicList)).toHaveLength(0)
  })

  it('sorts by accuracy ascending', () => {
    const progress = [
      { flashcardId: 'fc1', correct: true },   // t1: 1/2 = 50%
      { flashcardId: 'fc2', correct: false },
      { flashcardId: 'fc3', correct: false },   // t2: 0%
    ]
    const result = computeWeakTopics(progress, fcList, topicList)
    expect(result).toHaveLength(2)
    const [first, second] = result
    expect(first!.topicId).toBe('t2')   // 0% first
    expect(second!.topicId).toBe('t1')   // 50% second
  })

  it('renders pre-assess synthetic topic IDs as "Pre-Assessment: <Subject>"', () => {
    const progress = [
      { flashcardId: 'pa-q1', correct: false },
      { flashcardId: 'pa-q2', correct: false },
    ]
    const fcList = [
      { id: 'pa-q1', topicId: 'pre-assess-Mathematics' },
      { id: 'pa-q2', topicId: 'pre-assess-Mathematics' },
    ]
    const topicList: Array<{ id: string; name: string }> = []  // empty map
    const out = computeWeakTopics(progress, fcList, topicList)
    expect(out).toHaveLength(1)
    expect(out[0]?.topicName).toBe('Pre-Assessment: Mathematics')
  })
})

