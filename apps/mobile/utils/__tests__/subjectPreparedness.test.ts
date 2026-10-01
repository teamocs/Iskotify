import { subjectPreparedness } from '../subjectPreparedness'

describe('subjectPreparedness', () => {
  const subjects = [
    { id: 's-math', name: 'Math' },
    { id: 's-rc', name: 'Reading Comprehension' },
  ]

  it('is null (Not started), not 0%, for a subject with too little practice', () => {
    const topicRows = [{ topic: { id: 't1', subjectId: 's-math' } }]
    const result = subjectPreparedness(topicRows, subjects, new Map())
    expect(result).toEqual([{ id: 's-math', name: 'Math', pct: null }])
  })

  it('uses the recent accuracy by subject name', () => {
    const topicRows = [
      { topic: { id: 't1', subjectId: 's-math' } },
      { topic: { id: 't2', subjectId: 's-math' } },
    ]
    const result = subjectPreparedness(topicRows, subjects, new Map([['Math', 70]]))
    expect(result).toEqual([{ id: 's-math', name: 'Math', pct: 70 }])
  })

  it('sorts ascending (lowest / most in-need first) with not-started subjects last', () => {
    const subjectList = [...subjects, { id: 's-sci', name: 'Science' }]
    const topicRows = [
      { topic: { id: 't1', subjectId: 's-math' } },
      { topic: { id: 't2', subjectId: 's-rc' } },
      { topic: { id: 't3', subjectId: 's-sci' } },
    ]
    const result = subjectPreparedness(topicRows, subjectList, new Map([['Math', 90], ['Reading Comprehension', 30]]))
    expect(result.map(r => r.id)).toEqual(['s-rc', 's-math', 's-sci'])
  })

  it('caps to the given limit', () => {
    const subjectList = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, name: `Subject ${i}` }))
    const topicRows = subjectList.map((s, i) => ({ topic: { id: `t${i}`, subjectId: s.id } }))
    const result = subjectPreparedness(topicRows, subjectList, new Map(), 6)
    expect(result).toHaveLength(6)
  })

  it('excludes subjects with no topics', () => {
    const topicRows = [{ topic: { id: 't1', subjectId: 's-math' } }]
    const result = subjectPreparedness(topicRows, subjects, new Map())
    expect(result.map(r => r.id)).toEqual(['s-math'])
  })
})
