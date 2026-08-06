import { subjectPreparedness } from '../subjectPreparedness'

describe('subjectPreparedness', () => {
  const subjects = [
    { id: 's-math', name: 'Math' },
    { id: 's-rc', name: 'Reading Comprehension' },
  ]

  it('returns 0% for a subject with no session data at all (no flashcard fallback)', () => {
    const topicRows = [{ topic: { id: 't1', subjectId: 's-math' } }]
    const result = subjectPreparedness(topicRows, subjects, new Map(), new Map())
    expect(result).toEqual([{ id: 's-math', name: 'Math', pct: 0 }])
  })

  it('uses subjectReadinessPct (topic-review best, per topic)', () => {
    const topicRows = [
      { topic: { id: 't1', subjectId: 's-math' } },
      { topic: { id: 't2', subjectId: 's-math' } },
    ]
    const perTopicBest = new Map([['t1', 80], ['t2', 60]])
    const result = subjectPreparedness(topicRows, subjects, perTopicBest, new Map())
    expect(result).toEqual([{ id: 's-math', name: 'Math', pct: 70 }])
  })

  it('lifts topics via the subject-level mock best when no per-topic data exists', () => {
    const topicRows = [
      { topic: { id: 't1', subjectId: 's-rc' } },
      { topic: { id: 't2', subjectId: 's-rc' } },
    ]
    const subjectBest = new Map([['Reading Comprehension', 68]])
    const result = subjectPreparedness(topicRows, subjects, new Map(), subjectBest)
    expect(result).toEqual([{ id: 's-rc', name: 'Reading Comprehension', pct: 68 }])
  })

  it('sorts ascending (lowest / most in-need first)', () => {
    const topicRows = [
      { topic: { id: 't1', subjectId: 's-math' } },
      { topic: { id: 't2', subjectId: 's-rc' } },
    ]
    const perTopicBest = new Map([['t1', 90], ['t2', 30]])
    const result = subjectPreparedness(topicRows, subjects, perTopicBest, new Map())
    expect(result.map(r => r.id)).toEqual(['s-rc', 's-math'])
  })

  it('caps to the given limit', () => {
    const subjectList = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Subject ${i}` }))
    const topicRows = subjectList.map((s, i) => ({ topic: { id: `t${i}`, subjectId: s.id } }))
    const result = subjectPreparedness(topicRows, subjectList, new Map(), new Map(), 6)
    expect(result).toHaveLength(6)
  })

  it('excludes subjects with no topics', () => {
    const topicRows = [{ topic: { id: 't1', subjectId: 's-math' } }]
    const result = subjectPreparedness(topicRows, subjects, new Map(), new Map())
    expect(result.map(r => r.id)).toEqual(['s-math'])
  })
})
