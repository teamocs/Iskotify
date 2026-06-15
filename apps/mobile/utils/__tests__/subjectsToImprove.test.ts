import { subjectsToImprove } from '../subjectsToImprove'

type Row = { topic: { id: string; name: string; subjectId: string }; accuracy: number | null }

const subjects = [
  { id: 's-math', name: 'Math' },
  { id: 's-sci', name: 'Science' },
  { id: 's-eng', name: 'English' },
]

// New session-based signature:
//   subjectsToImprove(topicRows, subjects, perTopicBestById, subjectBestByName)
// pct per subject == subjectReadinessPct (session readiness across the subject's
// topics), falling back to flashcard accuracy only when a subject has NO session
// data at all. Still pure, still sorted ascending (lowest-first).

const noSessions = () => ({
  perTopicBest: new Map<string, number>(),
  subjectBest: new Map<string, number>(),
})

describe('subjectsToImprove (session-based readiness)', () => {
  it('returns empty when there are no topics', () => {
    const { perTopicBest, subjectBest } = noSessions()
    expect(subjectsToImprove([], subjects, perTopicBest, subjectBest)).toEqual([])
  })

  it('uses per-topic SESSION bests (averaged) for the subject %', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
      { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: null },
    ]
    const perTopicBest = new Map<string, number>([['t1', 80], ['t2', 40]])
    const subjectBest = new Map<string, number>()
    // (80 + 40) / 2 = 60 — flashcard accuracy is null but sessions drive it
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest)).toEqual([
      { id: 's-math', name: 'Math', pct: 60 },
    ])
  })

  it('REGRESSION: a subject practiced ONLY via mock (subtest session) shows its real % (mock lifts every topic)', () => {
    // Reading Comprehension-style case: no per-topic review rows; the subject was
    // practiced only through a blueprint/UPCAT mock whose `subtest` == subject name.
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Main Idea', subjectId: 's-sci' }, accuracy: null },
      { topic: { id: 't2', name: 'Inference', subjectId: 's-sci' }, accuracy: null },
    ]
    const perTopicBest = new Map<string, number>()
    const subjectBest = new Map<string, number>([['Science', 65]])
    // both topics lifted to the mock best (65) → average 65 (NOT 0)
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest)).toEqual([
      { id: 's-sci', name: 'Science', pct: 65 },
    ])
  })

  it('a per-topic review beats the subject mock for that topic', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
      { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: null },
    ]
    const perTopicBest = new Map<string, number>([['t1', 90]]) // review beats mock
    const subjectBest = new Map<string, number>([['Math', 50]])
    // t1 = max(90,50)=90 ; t2 = max(null,50)=50 → (90+50)/2 = 70
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest)).toEqual([
      { id: 's-math', name: 'Math', pct: 70 },
    ])
  })

  it('falls back to flashcard accuracy when the subject has NO session data', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 80 },
      { topic: { id: 't2', name: 'Geometry', subjectId: 's-math' }, accuracy: 40 },
    ]
    const { perTopicBest, subjectBest } = noSessions()
    // no sessions → fall back to flashcard accuracy average (80+40)/2 = 60
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest)).toEqual([
      { id: 's-math', name: 'Math', pct: 60 },
    ])
  })

  it('treats a subject with no sessions and no graded accuracies as 0', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
    ]
    const { perTopicBest, subjectBest } = noSessions()
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest)).toEqual([
      { id: 's-math', name: 'Math', pct: 0 },
    ])
  })

  it('sorts ascending by pct (lowest / most-need first)', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: null },
      { topic: { id: 't2', name: 'Biology', subjectId: 's-sci' }, accuracy: null },
      { topic: { id: 't3', name: 'Grammar', subjectId: 's-eng' }, accuracy: null },
    ]
    const perTopicBest = new Map<string, number>([['t1', 90], ['t2', 30], ['t3', 60]])
    const subjectBest = new Map<string, number>()
    expect(subjectsToImprove(rows, subjects, perTopicBest, subjectBest).map(s => s.id)).toEqual([
      's-sci', // 30
      's-eng', // 60
      's-math', // 90
    ])
  })

  it('only includes subjects that have at least one topic', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Algebra', subjectId: 's-math' }, accuracy: 50 },
    ]
    const { perTopicBest, subjectBest } = noSessions()
    const result = subjectsToImprove(rows, subjects, perTopicBest, subjectBest)
    expect(result).toHaveLength(1)
    expect(result.map(s => s.id)).not.toContain('s-sci')
    expect(result.map(s => s.id)).not.toContain('s-eng')
  })

  it('falls back to the subjectId as the name when the subject is missing from the list', () => {
    const rows: Row[] = [
      { topic: { id: 't1', name: 'Mystery', subjectId: 's-unknown' }, accuracy: 50 },
    ]
    const { perTopicBest, subjectBest } = noSessions()
    expect(subjectsToImprove(rows, [], perTopicBest, subjectBest)).toEqual([
      { id: 's-unknown', name: 's-unknown', pct: 50 },
    ])
  })
})
