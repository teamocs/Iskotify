import { computeStreak, computeTodayAccuracy, computeWeakTopics } from '../useHomeStats'

const DAY = 86_400_000

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
    expect(result[0].topicId).toBe('t1')
    expect(result[0].accuracy).toBe(0)
    expect(result[0].topicName).toBe('Algebra')
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
    expect(result[0].topicId).toBe('t2')   // 0% first
    expect(result[1].topicId).toBe('t1')   // 50% second
  })
})
