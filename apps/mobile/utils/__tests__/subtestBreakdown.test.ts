import { subtestBreakdown, nextFocusSubtest } from '../subtestBreakdown'

const q = (sectionName: string, correctIndex: number) => ({ sectionName, q: { correctIndex } })

describe('subtestBreakdown', () => {
  it('groups by section in first-seen order with correct/total/pct', () => {
    const questions = [q('Math', 1), q('Science', 0), q('Math', 2), q('Science', 3), q('Math', 0)]
    const answers = { 0: 1, 1: 2, 2: 2, 4: 3 } // Math 2/3, Science 0/2 (one blank)
    expect(subtestBreakdown(questions, answers)).toEqual([
      { name: 'Math', correct: 2, total: 3, pct: 67 },
      { name: 'Science', correct: 0, total: 2, pct: 0 },
    ])
  })

  it('returns an empty list for no questions', () => {
    expect(subtestBreakdown([], {})).toEqual([])
  })
})

describe('nextFocusSubtest', () => {
  it('names the lowest-scoring subtest as the next step', () => {
    expect(nextFocusSubtest([
      { name: 'Math', correct: 2, total: 3, pct: 67 },
      { name: 'Science', correct: 0, total: 2, pct: 0 },
      { name: 'Reading', correct: 1, total: 2, pct: 50 },
    ])).toBe('Science')
  })

  it('keeps the first on a tie', () => {
    expect(nextFocusSubtest([
      { name: 'A', correct: 1, total: 2, pct: 50 },
      { name: 'B', correct: 1, total: 2, pct: 50 },
    ])).toBe('A')
  })

  it('has no suggestion for a single subtest or a perfect run', () => {
    expect(nextFocusSubtest([{ name: 'A', correct: 1, total: 2, pct: 50 }])).toBeNull()
    expect(nextFocusSubtest([
      { name: 'A', correct: 2, total: 2, pct: 100 },
      { name: 'B', correct: 3, total: 3, pct: 100 },
    ])).toBeNull()
  })
})
