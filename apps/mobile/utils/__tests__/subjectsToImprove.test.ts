import { subjectsToImprove } from '../subjectsToImprove'

type Row = { topic: { id: string; name: string; subjectId: string }; accuracy: number | null }

const subjects = [
  { id: 's-math', name: 'Math' },
  { id: 's-sci', name: 'Science' },
  { id: 's-eng', name: 'English' },
]

describe('subjectsToImprove', () => {
  it('returns empty when there are no topics', () => {
    expect(subjectsToImprove([], subjects)).toEqual([])
  })

  it('averages the non-null topic accuracies per subject and rounds', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 80 },
      { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: 41 },
    ]
    // (80 + 41) / 2 = 60.5 -> 61 (rounded)
    expect(subjectsToImprove(rows, subjects)).toEqual([
      { id: 's-math', name: 'Math', pct: 61 },
    ])
  })

  it('treats a subject with topics but no graded accuracies as 0', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
    ]
    expect(subjectsToImprove(rows, subjects)).toEqual([
      { id: 's-math', name: 'Math', pct: 0 },
    ])
  })

  it('sorts ascending by pct (lowest / most-need first)', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 90 },
      { topic: { id: 't2', name: 'Biology', subjectId: 's-sci' }, accuracy: 30 },
      { topic: { id: 't3', name: 'Grammar', subjectId: 's-eng' }, accuracy: 60 },
    ]
    expect(subjectsToImprove(rows, subjects).map(s => s.id)).toEqual([
      's-sci', // 30
      's-eng', // 60
      's-math', // 90
    ])
  })

  it('only includes subjects that have at least one topic', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 50 },
    ]
    const result = subjectsToImprove(rows, subjects)
    expect(result).toHaveLength(1)
    expect(result.map(s => s.id)).not.toContain('s-sci')
    expect(result.map(s => s.id)).not.toContain('s-eng')
  })

  it('falls back to the subjectId as the name when the subject is missing from the list', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Mystery', subjectId: 's-unknown' }, accuracy: 50 },
    ]
    expect(subjectsToImprove(rows, [])).toEqual([
      { id: 's-unknown', name: 's-unknown', pct: 50 },
    ])
  })
})
