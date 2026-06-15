import { subjectMastery } from '../homeProgress'

interface Row {
  topic: { id: string; name: string; subjectId: string }
  accuracy: number | null
}

const subjects = [
  { id: 'math', name: 'Mathematics' },
  { id: 'sci', name: 'Science' },
  { id: 'fil', name: 'Filipino' },
]

describe('subjectMastery', () => {
  it('returns [] when there are no topic rows', () => {
    expect(subjectMastery([], subjects)).toEqual([])
  })

  it('averages each subject mastery over its non-null topic accuracies', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 'math' }, accuracy: 40 },
      { topic: { id: 't2', name: 'Geometry', subjectId: 'math' }, accuracy: 80 },
      { topic: { id: 't3', name: 'Biology', subjectId: 'sci' }, accuracy: 90 },
    ]
    const out = subjectMastery(rows, subjects)
    const math = out.find(s => s.name === 'Mathematics')
    const sci = out.find(s => s.name === 'Science')
    expect(math?.pct).toBe(60) // (40 + 80) / 2
    expect(sci?.pct).toBe(90)
  })

  it('skips null-accuracy topics when averaging', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 'math' }, accuracy: 50 },
      { topic: { id: 't2', name: 'Geometry', subjectId: 'math' }, accuracy: null },
    ]
    const out = subjectMastery(rows, subjects)
    expect(out.find(s => s.name === 'Mathematics')?.pct).toBe(50) // null ignored
  })

  it('drops subjects whose topics all have null accuracy (no graded topics)', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 'math' }, accuracy: 70 },
      { topic: { id: 't2', name: 'Genetics', subjectId: 'sci' }, accuracy: null },
    ]
    const out = subjectMastery(rows, subjects)
    expect(out.map(s => s.name)).toEqual(['Mathematics'])
  })

  it('maps subjectId → name via subjects[], falling back to the id when unknown', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Mystery', subjectId: 'ghost' }, accuracy: 33 },
    ]
    const out = subjectMastery(rows, subjects)
    expect(out[0]?.name).toBe('ghost')
  })

  it('sorts lowest-mastery first (most useful to study)', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'A', subjectId: 'math' }, accuracy: 90 },
      { topic: { id: 't2', name: 'B', subjectId: 'sci' }, accuracy: 20 },
      { topic: { id: 't3', name: 'C', subjectId: 'fil' }, accuracy: 55 },
    ]
    const out = subjectMastery(rows, subjects)
    expect(out.map(s => s.pct)).toEqual([20, 55, 90])
  })

  it('rounds the averaged mastery to a whole number', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'A', subjectId: 'math' }, accuracy: 50 },
      { topic: { id: 't2', name: 'B', subjectId: 'math' }, accuracy: 51 },
      { topic: { id: 't3', name: 'C', subjectId: 'math' }, accuracy: 52 },
    ]
    // (50 + 51 + 52) / 3 = 51
    expect(subjectMastery(rows, subjects)[0]?.pct).toBe(51)
  })
})
