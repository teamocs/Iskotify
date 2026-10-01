import { WEAK_THRESHOLD, MIN_SAMPLE, classify, pickWeakTopics } from '../weakness'

describe('weakness constants', () => {
  it('is one threshold (60%) and one minimum sample (5) for plan, badge and listing quiz', () => {
    expect(WEAK_THRESHOLD).toBe(0.6)
    expect(MIN_SAMPLE).toBe(5)
  })
})

describe('classify', () => {
  it("is 'new' below the minimum sample whatever the accuracy", () => {
    expect(classify(0, 0)).toBe('new')
    expect(classify(0, MIN_SAMPLE - 1)).toBe('new')
    expect(classify(MIN_SAMPLE - 1, MIN_SAMPLE - 1)).toBe('new')
  })

  it('is weak below 60%, review below 80%, strong from 80%', () => {
    expect(classify(2, 5)).toBe('weak')    // 40%
    expect(classify(2.9, 5)).toBe('weak')  // just under 60%
    expect(classify(3, 5)).toBe('review')  // exactly 60% is NOT weak
    expect(classify(7, 10)).toBe('review')
    expect(classify(4, 5)).toBe('strong')  // exactly 80%
  })
})

describe('pickWeakTopics', () => {
  const names = new Map([['t1', 'Algebra'], ['t2', 'Biology'], ['t3', 'History']])

  it('keeps only weak topics with enough answers, weakest first, capped', () => {
    const out = pickWeakTopics([
      { topicId: 't1', total: 5, ok: 1 },  // 20% weak
      { topicId: 't2', total: 2, ok: 0 },  // 0% but below MIN_SAMPLE -> excluded
      { topicId: 't3', total: 10, ok: 9 }, // strong
    ], names)
    expect(out).toEqual([{ topicId: 't1', topicName: 'Algebra', accuracy: 20 }])
  })

  it('resolves pre-assess ids through resolveTopicLabel and honours the limit', () => {
    const stats = ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ topicId: `t-${x}`, total: 5, ok: i === 0 ? 0 : 1 }))
    expect(pickWeakTopics(stats, new Map(), 4)).toHaveLength(4)
    expect(pickWeakTopics([{ topicId: 'pre-assess-Mathematics', total: 5, ok: 0 }], new Map())[0]!.topicName)
      .toBe('Pre-Assessment: Mathematics')
  })
})
