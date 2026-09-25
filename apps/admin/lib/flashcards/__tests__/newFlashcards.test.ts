import { describe, it, expect } from 'vitest'
import { validateNewFlashcards, isNewFlashcardsDirty, INITIAL_NEW_FLASHCARDS, type NewFlashcardsValues } from '../newFlashcards'

const valid: NewFlashcardsValues = {
  subject: 'Science',
  topic: 'Cell Biology',
  listingSlugs: ['upcat'],
  cards: [{ question: 'What is a cell?', answer: 'The unit of life', explanation: '' }],
  formatNotes: '',
  sampleText: '',
}

describe('validateNewFlashcards', () => {
  it('passes a complete form', () => {
    expect(validateNewFlashcards(valid)).toEqual({})
  })

  it('keys an error to every missing required field', () => {
    const errors = validateNewFlashcards({
      ...valid,
      subject: '  ',
      topic: '',
      listingSlugs: [],
      cards: [
        { question: 'Q', answer: 'A', explanation: '' },
        { question: '', answer: ' ', explanation: 'only an explanation' },
      ],
    })
    expect(Object.keys(errors).sort()).toEqual(['card-1-answer', 'card-1-question', 'listings', 'subject', 'topic'])
    expect(errors.subject).toMatch(/subject/i)
    expect(errors.listings).toMatch(/at least one/i)
  })
})

describe('isNewFlashcardsDirty', () => {
  it('is clean at the initial values', () => {
    expect(isNewFlashcardsDirty(INITIAL_NEW_FLASHCARDS)).toBe(false)
  })

  it('is dirty once anything is typed or picked', () => {
    expect(isNewFlashcardsDirty({ ...INITIAL_NEW_FLASHCARDS, subject: 'x' })).toBe(true)
    expect(isNewFlashcardsDirty({ ...INITIAL_NEW_FLASHCARDS, listingSlugs: ['a'] })).toBe(true)
    expect(isNewFlashcardsDirty({ ...INITIAL_NEW_FLASHCARDS, cards: [{ question: '', answer: 'a', explanation: '' }] })).toBe(true)
    expect(isNewFlashcardsDirty({ ...INITIAL_NEW_FLASHCARDS, sampleText: 'sample' })).toBe(true)
  })

  it('treats an extra blank card as clean', () => {
    const blank = { question: '', answer: '', explanation: '' }
    expect(isNewFlashcardsDirty({ ...INITIAL_NEW_FLASHCARDS, cards: [blank, blank] })).toBe(false)
  })
})
