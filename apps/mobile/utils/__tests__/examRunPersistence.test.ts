import {
  runKeyFor, reorderByIds, safeParseJson, reconstructBuiltExamFromRun,
} from '../examRunPersistence'

describe('runKeyFor', () => {
  it('builds a stable key from kind + slug', () => {
    expect(runKeyFor('exam', 'upcat')).toBe('exam:upcat')
  })
  it('includes mode when given', () => {
    expect(runKeyFor('upcat', 'all', 'full')).toBe('upcat:all:full')
  })
  it('omits an empty mode (no trailing colon)', () => {
    expect(runKeyFor('diagnostic', 'Science', '')).toBe('diagnostic:Science')
  })
})

describe('reorderByIds', () => {
  const pool = [
    { questionId: 'a', v: 1 },
    { questionId: 'b', v: 2 },
    { questionId: 'c', v: 3 },
  ]

  it('reorders the pool to match the given id order', () => {
    expect(reorderByIds(pool, ['c', 'a'], 'questionId')).toEqual([
      { questionId: 'c', v: 3 },
      { questionId: 'a', v: 1 },
    ])
  })

  it('drops ids no longer present in the pool (e.g. a question was unpublished)', () => {
    expect(reorderByIds(pool, ['a', 'missing', 'b'], 'questionId')).toEqual([
      { questionId: 'a', v: 1 },
      { questionId: 'b', v: 2 },
    ])
  })

  it('returns an empty array for an empty id list', () => {
    expect(reorderByIds(pool, [], 'questionId')).toEqual([])
  })
})

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    expect(safeParseJson('{"a":1}', {})).toEqual({ a: 1 })
  })
  it('falls back on invalid JSON rather than throwing', () => {
    expect(safeParseJson('not json', { fallback: true })).toEqual({ fallback: true })
  })
  it('falls back on null/undefined input', () => {
    expect(safeParseJson(null, [])).toEqual([])
    expect(safeParseJson(undefined, [])).toEqual([])
  })
})

describe('reconstructBuiltExamFromRun', () => {
  const sections = [
    { name: 'Math', id: 's1' },
    { name: 'Science', id: 's2' },
    { name: 'English', id: 's3' }, // not present in the resumed flat list below
  ]

  it('groups consecutive same-section-name questions back into runnable sections, matched by name', () => {
    const flat = [
      { q: { questionId: 'q1' }, sectionName: 'Math' },
      { q: { questionId: 'q2' }, sectionName: 'Math' },
      { q: { questionId: 'q3' }, sectionName: 'Science' },
    ]
    const built = reconstructBuiltExamFromRun(sections, flat)
    expect(built.runnable).toHaveLength(2)
    expect(built.runnable[0]!.section.name).toBe('Math')
    expect(built.runnable[0]!.questions).toHaveLength(2)
    expect(built.runnable[1]!.section.name).toBe('Science')
    expect(built.runnable[1]!.questions).toHaveLength(1)
    expect(built.totalQuestions).toBe(3)
  })

  it('lists blueprint sections absent from the resumed run as comingSoon', () => {
    const flat = [{ q: { questionId: 'q1' }, sectionName: 'Math' }]
    const built = reconstructBuiltExamFromRun(sections, flat)
    expect(built.comingSoon.map(s => s.name)).toEqual(['Science', 'English'])
  })

  it('returns an empty runnable/zero total for an empty resumed run', () => {
    const built = reconstructBuiltExamFromRun(sections, [])
    expect(built.runnable).toEqual([])
    expect(built.totalQuestions).toBe(0)
  })

  it('drops a group whose sectionName no longer matches any blueprint section', () => {
    const flat = [{ q: { questionId: 'q1' }, sectionName: 'Deleted Section' }]
    const built = reconstructBuiltExamFromRun(sections, flat)
    expect(built.runnable).toEqual([])
    expect(built.totalQuestions).toBe(0)
  })
})
