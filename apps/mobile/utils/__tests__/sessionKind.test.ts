import { isMockSession, sittingKey, weightedAccuracy, countSittings, isProgressSession, upcatDrillKind } from '../sessionKind'

describe('isMockSession', () => {
  it('kind=mock is a mock; every other kind is not', () => {
    expect(isMockSession({ kind: 'mock', topicId: '', subtest: 'Mathematics' })).toBe(true)
    for (const kind of ['sprint', 'drill', 'diagnostic', 'flashcard', 'onboarding'] as const) {
      expect(isMockSession({ kind, topicId: '', subtest: 'Mathematics' })).toBe(false)
    }
  })

  it('legacy rows (kind null/undefined) keep the old inference: topicId empty + subtest set', () => {
    expect(isMockSession({ kind: null, topicId: '', subtest: 'Science' })).toBe(true)
    expect(isMockSession({ topicId: '', subtest: 'Science' })).toBe(true)
    expect(isMockSession({ kind: null, topicId: 't1', subtest: 'Science' })).toBe(false)
    expect(isMockSession({ kind: null, topicId: '', subtest: null })).toBe(false)
  })
})

describe('sittingKey', () => {
  it('uses attemptKey when present', () => {
    expect(sittingKey({ attemptKey: 1000, completedAt: 9_999_000, durationSecs: 5 })).toBe(1000)
  })

  it('legacy rows derive the key from completedAt - duration, to the second', () => {
    expect(sittingKey({ attemptKey: null, completedAt: 100_000, durationSecs: 40 })).toBe(60)
  })
})

describe('weightedAccuracy', () => {
  it('is sum(score)/sum(total), not the mean of per-row percentages', () => {
    // 1/1 (100%) and 1/9 (11%): unweighted mean = 56, weighted = 2/10 = 20
    expect(weightedAccuracy([{ score: 1, total: 1 }, { score: 1, total: 9 }])).toBe(20)
  })

  it('ignores rows with total 0 and returns null when nothing has a total', () => {
    expect(weightedAccuracy([{ score: 0, total: 0 }])).toBeNull()
    expect(weightedAccuracy([])).toBeNull()
    expect(weightedAccuracy([{ score: 0, total: 0 }, { score: 3, total: 4 }])).toBe(75)
  })
})

describe('countSittings', () => {
  it('counts section rows sharing an attempt_key as one sitting', () => {
    const rows = [
      { attemptKey: 10, completedAt: 5_000, durationSecs: 1 },
      { attemptKey: 10, completedAt: 9_000, durationSecs: 9 },
      { attemptKey: 20, completedAt: 9_500, durationSecs: 1 },
    ]
    expect(countSittings(rows)).toBe(2)
  })

  it('legacy rows use the derived key', () => {
    const rows = [
      { attemptKey: null, completedAt: 100_000, durationSecs: 40 },
      { attemptKey: null, completedAt: 100_003, durationSecs: 40 },
      { attemptKey: null, completedAt: 300_000, durationSecs: 10 },
    ]
    expect(countSittings(rows)).toBe(2)
  })
})

describe('isProgressSession', () => {
  it('drops onboarding quick-check rows by kind and by legacy pre-assess topicId', () => {
    expect(isProgressSession({ kind: 'onboarding', topicId: 'pre-assess-Math' })).toBe(false)
    expect(isProgressSession({ kind: null, topicId: 'pre-assess-Math' })).toBe(false)
    expect(isProgressSession({ kind: 'drill', topicId: '' })).toBe(true)
    expect(isProgressSession({ topicId: 't1' })).toBe(true)
  })
})

describe('upcatDrillKind', () => {
  it("is a mock only for the full all-subtest run; every single-subtest or quick run is a drill", () => {
    expect(upcatDrillKind('all', 'full')).toBe('mock')
    expect(upcatDrillKind('all', undefined)).toBe('mock')
    expect(upcatDrillKind('all', 'quick')).toBe('drill')
    expect(upcatDrillKind('Mathematics', 'full')).toBe('drill')
    expect(upcatDrillKind('Science', 'quick')).toBe('drill')
  })
})
