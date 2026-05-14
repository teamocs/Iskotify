import { computeStrength } from '../usePracticeData'

const fcList = [
  { id: 'fc1', topicId: 't1' },
  { id: 'fc2', topicId: 't1' },
  { id: 'fc3', topicId: 't2' },
]

describe('computeStrength', () => {
  it('returns New with no progress', () => {
    expect(computeStrength('t1', [], fcList)).toBe('New')
  })

  it('returns Weak when accuracy < 50%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: false },
      { flashcardId: 'fc2', correct: false },
    ], fcList)).toBe('Weak')
  })

  it('returns Review when accuracy is 50%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: false },
    ], fcList)).toBe('Review')
  })

  it('returns Strong when accuracy >= 80%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: true },
    ], fcList)).toBe('Strong')
  })

  it('handles SQLite numeric 0/1 for correct', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: 1 },
      { flashcardId: 'fc2', correct: 0 },
    ], fcList)).toBe('Review')
  })

  it('ignores progress records for flashcards in other topics', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc3', correct: true }, // fc3 belongs to t2, not t1
    ], fcList)).toBe('New')
  })
})
