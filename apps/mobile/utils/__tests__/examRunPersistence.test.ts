import {
  runKeyFor, reorderByIds, safeParseJson, reconstructBuiltExamFromRun,
  remapIndexedById, remapSingleIndex,
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

// Review finding #1 (HIGH): reorderByIds drops missing ids and COMPACTS the
// remaining ones, so an answers/flags record keyed by the ORIGINAL flat index
// must be remapped through the surviving id order — otherwise resume
// misattributes an answer to the wrong question once anything earlier in the
// list vanished.
describe('remapIndexedById', () => {
  const originalIds = ['q1', 'q2', 'q3', 'q4', 'q5']

  it('a saved run where question 2 of 5 was removed restores answers onto the right questions', () => {
    // q2 (originally index 1) is gone from the current pool.
    const newIds = ['q1', 'q3', 'q4', 'q5']
    const answers = { 0: 1, 1: 2, 2: 0, 3: 3, 4: 1 } // keyed by ORIGINAL index
    const remapped = remapIndexedById(originalIds, newIds, answers)
    // q1 -> new index 0, q3 -> 1, q4 -> 2, q5 -> 3. q2's answer is dropped.
    expect(remapped).toEqual({ 0: 1, 1: 0, 2: 3, 3: 1 })
  })

  it('drops answers for questions no longer present at all', () => {
    const newIds = ['q1', 'q5']
    const answers = { 0: 1, 1: 2, 4: 3 }
    expect(remapIndexedById(originalIds, newIds, answers)).toEqual({ 0: 1, 1: 3 })
  })

  it('returns an empty object when nothing survived', () => {
    expect(remapIndexedById(originalIds, [], { 0: 1, 2: 2 })).toEqual({})
  })

  it('is a no-op when nothing was removed (order unchanged)', () => {
    const answers = { 0: 1, 2: 3, 4: 2 }
    expect(remapIndexedById(originalIds, originalIds, answers)).toEqual(answers)
  })

  it('ignores an out-of-range old index rather than throwing', () => {
    expect(remapIndexedById(originalIds, originalIds, { 99: 1 })).toEqual({})
  })
})

describe('remapSingleIndex', () => {
  const originalIds = ['q1', 'q2', 'q3', 'q4', 'q5']
  const newIds = ['q1', 'q3', 'q4', 'q5'] // q2 removed

  it('maps a surviving old index to its new (compacted) position', () => {
    expect(remapSingleIndex(originalIds, newIds, 2)).toBe(1) // q3: was 2, now 1
    expect(remapSingleIndex(originalIds, newIds, 4)).toBe(3) // q5: was 4, now 3
    expect(remapSingleIndex(originalIds, newIds, 0)).toBe(0) // q1: unchanged
  })

  it('falls back to a clamped index when the original question itself vanished', () => {
    // q2 (old index 1) is gone — clamp into the surviving range rather than crash.
    const result = remapSingleIndex(originalIds, newIds, 1)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(newIds.length)
  })

  it('clamps to the last surviving index when everything after it vanished', () => {
    expect(remapSingleIndex(originalIds, [], 3)).toBe(0)
  })
})
