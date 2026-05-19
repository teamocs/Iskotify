import { buildSessionRecord } from '../useRecordSession'

describe('buildSessionRecord', () => {
  it('computes durationSecs from startTime', () => {
    const startTime = Date.now() - 62_000
    const record = buildSessionRecord({
      listingSlug: 'upcat-2025', topicId: 'topic-1', deckId: '',
      score: 8, total: 10, startTime,
    })
    expect(record.durationSecs).toBeGreaterThanOrEqual(61)
    expect(record.durationSecs).toBeLessThanOrEqual(65)
    expect(record.score).toBe(8)
    expect(record.total).toBe(10)
    expect(record.completedAt).toBeGreaterThan(startTime)
  })

  it('preserves empty string fields', () => {
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 5, startTime: Date.now(),
    })
    expect(record.listingSlug).toBe('')
    expect(record.topicId).toBe('')
    expect(record.deckId).toBe('')
  })

  it('rounds durationSecs to whole seconds', () => {
    const startTime = Date.now() - 30_500
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 1, startTime,
    })
    expect(Number.isInteger(record.durationSecs)).toBe(true)
  })
})
