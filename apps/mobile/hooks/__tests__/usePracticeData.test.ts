import { computeStrength, filterTopicsWithCards } from '../usePracticeData'

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

describe('filterTopicsWithCards', () => {
  it('drops topics with no cards in the flashcard list', () => {
    const topics = [
      { id: 't1', name: 'Algebra', subjectId: 'math' },
      { id: 't2', name: 'Geometry', subjectId: 'math' },
      { id: 'ghost', name: 'DOST-SEI Examination', subjectId: 'dostsei' },
    ]
    const cards = [
      { topicId: 't1' }, { topicId: 't1' }, { topicId: 't2' },
    ]
    const out = filterTopicsWithCards(topics, cards)
    expect(out.map(t => t.id)).toEqual(['t1', 't2'])
  })

  it('returns empty when no topics have cards', () => {
    const topics = [
      { id: 'ghost1', name: 'A', subjectId: 's1' },
      { id: 'ghost2', name: 'B', subjectId: 's1' },
    ]
    expect(filterTopicsWithCards(topics, [])).toEqual([])
  })

  it('keeps all topics when every topic has at least one card', () => {
    const topics = [
      { id: 't1', name: 'A', subjectId: 's1' },
      { id: 't2', name: 'B', subjectId: 's1' },
    ]
    const cards = [{ topicId: 't1' }, { topicId: 't2' }]
    const out = filterTopicsWithCards(topics, cards)
    expect(out).toHaveLength(2)
  })

  it('preserves topic object identity (does not clone)', () => {
    const t = { id: 't1', name: 'A', subjectId: 's1' }
    const out = filterTopicsWithCards([t], [{ topicId: 't1' }])
    expect(out[0]).toBe(t)
  })
})
