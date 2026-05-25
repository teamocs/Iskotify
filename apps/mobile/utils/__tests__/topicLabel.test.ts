import { resolveTopicLabel } from '../topicLabel'

describe('resolveTopicLabel', () => {
  it('returns the mapped name when topicId exists in the map', () => {
    const map = new Map([['t1', 'Algebra'], ['t2', 'Biology']])
    expect(resolveTopicLabel('t1', map)).toBe('Algebra')
  })

  it('returns "Pre-Assessment: <Subject>" for pre-assess-* synthetic IDs', () => {
    const map = new Map<string, string>()
    expect(resolveTopicLabel('pre-assess-Mathematics', map)).toBe('Pre-Assessment: Mathematics')
    expect(resolveTopicLabel('pre-assess-Filipino', map)).toBe('Pre-Assessment: Filipino')
  })

  it('falls back to the topicId itself when no mapping and no pre-assess prefix', () => {
    const map = new Map<string, string>()
    expect(resolveTopicLabel('unknown-topic-id', map)).toBe('unknown-topic-id')
  })

  it('prefers the map over the prefix when both could apply (defensive)', () => {
    const map = new Map([['pre-assess-Math', 'Custom Override']])
    expect(resolveTopicLabel('pre-assess-Math', map)).toBe('Custom Override')
  })
})
