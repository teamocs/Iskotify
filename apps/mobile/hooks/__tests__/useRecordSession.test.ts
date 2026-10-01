import { buildSessionRecord } from '../useRecordSession'

describe('buildSessionRecord', () => {
  it('computes durationSecs from startTime', () => {
    const startTime = Date.now() - 62_000
    const record = buildSessionRecord({
      listingSlug: 'upcat-2025', topicId: 'topic-1', deckId: '',
      score: 8, total: 10, startTime, kind: 'drill',
    })
    expect(record.durationSecs).toBeGreaterThanOrEqual(61)
    expect(record.durationSecs).toBeLessThanOrEqual(65)
    expect(record.score).toBe(8)
    expect(record.total).toBe(10)
    expect(record.completedAt).toBeGreaterThan(startTime)
    expect(record.subtest).toBeNull()
  })

  it('preserves empty string fields', () => {
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 5, startTime: Date.now(), kind: 'drill',
    })
    expect(record.listingSlug).toBe('')
    expect(record.topicId).toBe('')
    expect(record.deckId).toBe('')
    expect(record.subtest).toBeNull()
  })

  it('rounds durationSecs to whole seconds', () => {
    const startTime = Date.now() - 30_500
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 1, startTime, kind: 'drill',
    })
    expect(Number.isInteger(record.durationSecs)).toBe(true)
  })

  it('threads subtest tag through when provided', () => {
    const record = buildSessionRecord({
      listingSlug: 'upcat-2025', topicId: 'topic-1', deckId: 'deck-1',
      score: 5, total: 10, startTime: Date.now(), subtest: 'Mathematics', kind: 'drill',
    })
    expect(record.subtest).toBe('Mathematics')
  })
})

describe('buildSessionRecord — kind / attemptKey (A1)', () => {
  it('carries kind through and defaults attemptKey to startTime', () => {
    const startTime = Date.now() - 5_000
    const record = buildSessionRecord({
      listingSlug: 'upcat', topicId: '', deckId: '', score: 1, total: 2, startTime,
      kind: 'mock', subtest: 'Mathematics',
    })
    expect(record.kind).toBe('mock')
    expect(record.attemptKey).toBe(startTime)
  })

  it('honours an explicit attemptKey so every section of one sitting shares it', () => {
    const a = buildSessionRecord({
      listingSlug: 'upcat', topicId: '', deckId: '', score: 1, total: 2,
      startTime: 1_000, attemptKey: 500, kind: 'sprint',
    })
    const b = buildSessionRecord({
      listingSlug: 'upcat', topicId: '', deckId: '', score: 1, total: 2,
      startTime: 2_000, attemptKey: 500, kind: 'sprint',
    })
    expect(a.attemptKey).toBe(500)
    expect(b.attemptKey).toBe(500)
  })
})
