import { computeStreak, computeStreakFromDays, computeTodayAccuracy, computeWeakTopics, localDayOffsetMs, computeImportantDayIndices } from '../useHomeStats'

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

describe('computeImportantDayIndices (local calendar, Asia/Manila +8h)', () => {
  const PH = 8 * HOUR
  const idx = (m: number, d: number) => Date.UTC(2026, m, d) / DAY

  it('puts an exam / deadline date-only value on its own calendar date', () => {
    const out = computeImportantDayIndices(
      [{ examDate: Date.UTC(2026, 9, 1), deadline: Date.UTC(2026, 9, 5) }], [], PH)
    expect(out).toEqual([idx(9, 1), idx(9, 5)])
  })

  it('buckets a note reminder by its LOCAL day: 07:30 and 23:30 PH on 2 Oct are both 2 Oct', () => {
    const early = Date.UTC(2026, 9, 1, 23, 30) // 07:30 PH 2 Oct (UTC is still 1 Oct)
    const late = Date.UTC(2026, 9, 2, 15, 30) // 23:30 PH 2 Oct
    expect(computeImportantDayIndices([], [{ reminderAt: early }, { reminderAt: late }], PH))
      .toEqual([idx(9, 2), idx(9, 2)])
  })

  it('skips null dates', () => {
    expect(computeImportantDayIndices([{ examDate: null, deadline: null }], [{ reminderAt: null }], PH)).toEqual([])
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
  // A9: weak = <60% over at least MIN_SAMPLE (5) answers, shared with the plan.
  const fcList = [
    { id: 'fc1', topicId: 't1' },
    { id: 'fc2', topicId: 't1' },
    { id: 'fc3', topicId: 't2' },
  ]
  const topicList = [
    { id: 't1', name: 'Algebra' },
    { id: 't2', name: 'Biology' },
  ]
  const many = (flashcardId: string, correct: number, wrong: number) => [
    ...Array.from({ length: correct }, () => ({ flashcardId, correct: true })),
    ...Array.from({ length: wrong }, () => ({ flashcardId, correct: false })),
  ]

  it('returns empty array with no progress', () => {
    expect(computeWeakTopics([], fcList, topicList)).toEqual([])
  })

  it('returns topics with accuracy < 60', () => {
    const result = computeWeakTopics(many('fc1', 0, 5), fcList, topicList)
    expect(result).toHaveLength(1)
    const topic = result[0]!
    expect(topic.topicId).toBe('t1')
    expect(topic.accuracy).toBe(0)
    expect(topic.topicName).toBe('Algebra')
  })

  it('does not flag a topic with fewer than the minimum sample', () => {
    expect(computeWeakTopics(many('fc1', 0, 4), fcList, topicList)).toEqual([])
  })

  it('excludes topics with accuracy >= 60', () => {
    expect(computeWeakTopics(many('fc1', 3, 2), fcList, topicList)).toHaveLength(0)
  })

  it('sorts by accuracy ascending', () => {
    const progress = [
      ...many('fc1', 2, 3),   // t1: 40%
      ...many('fc3', 0, 5),   // t2: 0%
    ]
    const result = computeWeakTopics(progress, fcList, topicList)
    expect(result).toHaveLength(2)
    const [first, second] = result
    expect(first!.topicId).toBe('t2')   // 0% first
    expect(second!.topicId).toBe('t1')   // 40% second
  })

  it('renders pre-assess synthetic topic IDs as "Pre-Assessment: <Subject>"', () => {
    const progress = many('pa-q1', 0, 5)
    const fcList = [
      { id: 'pa-q1', topicId: 'pre-assess-Mathematics' },
    ]
    const topicList: Array<{ id: string; name: string }> = []  // empty map
    const out = computeWeakTopics(progress, fcList, topicList)
    expect(out).toHaveLength(1)
    expect(out[0]?.topicName).toBe('Pre-Assessment: Mathematics')
  })
})

