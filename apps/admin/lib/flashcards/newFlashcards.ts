export interface CardRow {
  question: string
  answer: string
  explanation: string
}

export interface NewFlashcardsValues {
  subject: string
  topic: string
  listingSlugs: string[]
  cards: CardRow[]
  formatNotes: string
  sampleText: string
}

export const BLANK_CARD: CardRow = { question: '', answer: '', explanation: '' }

export const INITIAL_NEW_FLASHCARDS: NewFlashcardsValues = {
  subject: '',
  topic: '',
  listingSlugs: [],
  cards: [BLANK_CARD],
  formatNotes: '',
  sampleText: '',
}

/** Field errors keyed by field: `subject`, `topic`, `listings`, `card-<i>-question`, `card-<i>-answer`. */
export type NewFlashcardsErrors = Partial<Record<string, string>>

export const cardFieldKey = (index: number, field: 'question' | 'answer') => `card-${index}-${field}`

export function validateNewFlashcards(v: NewFlashcardsValues): NewFlashcardsErrors {
  const errors: NewFlashcardsErrors = {}
  if (!v.subject.trim()) errors.subject = 'Enter a subject.'
  if (!v.topic.trim()) errors.topic = 'Enter a topic.'
  if (v.listingSlugs.length === 0) errors.listings = 'Select at least one exam or scholarship.'
  v.cards.forEach((c, i) => {
    if (!c.question.trim()) errors[cardFieldKey(i, 'question')] = 'Enter the question.'
    if (!c.answer.trim()) errors[cardFieldKey(i, 'answer')] = 'Enter the answer.'
  })
  return errors
}

const cardHasContent = (c: CardRow) => Boolean(c.question.trim() || c.answer.trim() || c.explanation.trim())

/** Anything the operator would lose by leaving: typed text, picked tags, card content. */
export function isNewFlashcardsDirty(v: NewFlashcardsValues): boolean {
  return Boolean(
    v.subject.trim() || v.topic.trim() || v.formatNotes.trim() || v.sampleText.trim() ||
    v.listingSlugs.length > 0 || v.cards.some(cardHasContent),
  )
}
