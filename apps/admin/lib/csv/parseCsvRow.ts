export interface RawCsvRow {
  subject?: string
  topic?: string
  question?: string
  answer?: string
  explanation?: string
  distractors?: string
}

export interface ValidatedRow {
  subject: string
  topic: string
  question: string
  answer: string
  explanation: string
  distractors: string[]  // length 0 (empty) or 3
}

export interface RowError {
  rowIndex: number
  field: keyof RawCsvRow
  message: string
}

const LIMITS = {
  subject: 200, topic: 200, question: 2000, answer: 500, explanation: 1000, distractorEach: 500,
} as const

export function parseCsvRow(
  row: RawCsvRow,
  rowIndex: number,
): { ok: true; value: ValidatedRow } | { ok: false; errors: RowError[] } {
  const errors: RowError[] = []
  const trim = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

  const subject = trim(row.subject)
  const topic = trim(row.topic)
  const question = trim(row.question)
  const answer = trim(row.answer)
  const explanation = trim(row.explanation)
  const distractorsRaw = trim(row.distractors)

  const requireNonEmpty = (val: string, field: keyof RawCsvRow) => {
    if (!val) errors.push({ rowIndex, field, message: `${field} is required` })
  }
  const requireMax = (val: string, max: number, field: keyof RawCsvRow) => {
    if (val.length > max) errors.push({ rowIndex, field, message: `${field} exceeds max length of ${max}` })
  }

  requireNonEmpty(subject, 'subject'); requireMax(subject, LIMITS.subject, 'subject')
  requireNonEmpty(topic, 'topic');     requireMax(topic, LIMITS.topic, 'topic')
  requireNonEmpty(question, 'question'); requireMax(question, LIMITS.question, 'question')
  requireNonEmpty(answer, 'answer');   requireMax(answer, LIMITS.answer, 'answer')
  requireMax(explanation, LIMITS.explanation, 'explanation')

  let distractors: string[] = []
  if (distractorsRaw) {
    distractors = distractorsRaw.split('|').map(d => d.trim())
    if (distractors.length !== 3) {
      errors.push({ rowIndex, field: 'distractors',
        message: `distractors must be exactly 3 pipe-separated values (got ${distractors.length})` })
    }
    if (distractors.some(d => !d)) {
      errors.push({ rowIndex, field: 'distractors', message: 'distractors cannot contain empty values' })
    }
    if (distractors.some(d => d.length > LIMITS.distractorEach)) {
      errors.push({ rowIndex, field: 'distractors', message: `each distractor exceeds max length of ${LIMITS.distractorEach}` })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, value: { subject, topic, question, answer, explanation, distractors } }
}
