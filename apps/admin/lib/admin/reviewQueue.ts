// Pure helpers for the Distractor Review Queue (app/admin/upcat/review-queue).
//
// Dismissals are shared by the team in question_flag_dismissals (migration 059),
// written through /api/admin/question-flags. Each is keyed by question id + a
// fingerprint of the options, so editing the options changes the fingerprint
// and a question whose options are still weak comes back into the queue.

/** FNV-1a (32-bit) over the JSON of the options: order- and split-sensitive. */
export function optionsFingerprint(options: readonly string[]): string {
  const text = JSON.stringify(options)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function dismissalKey(questionId: string, options: readonly string[]): string {
  return `${questionId}#${optionsFingerprint(options)}`
}

export interface DismissalRow {
  question_id: string
  options_fingerprint: string
}

/** Rows from question_flag_dismissals as the keys partitionByDismissal matches on. */
export function dismissalKeysFrom(rows: readonly DismissalRow[]): string[] {
  return rows.map(r => `${r.question_id}#${r.options_fingerprint}`)
}

const FINGERPRINT_RE = /^[0-9a-f]{8}$/
const MAX_QUESTION_ID = 200

/** Validates a dismiss/restore request body (or query) for the route. */
export function parseDismissalInput(input: unknown):
  | { ok: true; value: DismissalRow }
  | { ok: false; error: string } {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Body must be an object' }
  const { question_id, options_fingerprint } = input as Record<string, unknown>
  if (typeof question_id !== 'string' || !question_id.trim() || question_id.trim().length > MAX_QUESTION_ID) {
    return { ok: false, error: 'question_id must be a non-empty string' }
  }
  if (typeof options_fingerprint !== 'string' || !FINGERPRINT_RE.test(options_fingerprint)) {
    return { ok: false, error: 'options_fingerprint must be 8 lowercase hex characters' }
  }
  return { ok: true, value: { question_id: question_id.trim(), options_fingerprint } }
}

export function addDismissal(list: readonly string[], key: string): string[] {
  return list.includes(key) ? [...list] : [...list, key]
}

export function removeDismissal(list: readonly string[], key: string): string[] {
  return list.filter(k => k !== key)
}

export function partitionByDismissal<T extends { question_id: string; options: string[] }>(
  items: readonly T[],
  dismissed: readonly string[],
): { active: T[]; dismissed: T[] } {
  const set = new Set(dismissed)
  const active: T[] = []
  const gone: T[] = []
  for (const item of items) (set.has(dismissalKey(item.question_id, item.options)) ? gone : active).push(item)
  return { active, dismissed: gone }
}

// ── Question edit (matches PATCH /api/upcat-questions/[id]) ──────────────────

export interface QuestionDraft {
  question_text: string
  options: string[]
  correct_index: number
}

export type QuestionErrors = Partial<Record<'question_text' | 'correct_index' | `option_${number}`, string>>

/**
 * The drawer shows this many option fields; questions may use 2–4 of them
 * (e.g. TRUE / FALSE / Cannot be certain). Blank trailing options are dropped.
 */
export const MIN_OPTIONS = 4
/** The route's rules: non-empty text, >= 2 options with no gaps, correct_index 0..3 inside them. */
export const MIN_FILLED_OPTIONS = 2
const MAX_CORRECT_INDEX = 3

/** The options as saved: blank trailing options removed. */
export function filledOptions(options: readonly string[]): string[] {
  let end = options.length
  while (end > 0 && !options[end - 1]!.trim()) end--
  return options.slice(0, end)
}

export function validateQuestionDraft(draft: QuestionDraft): QuestionErrors {
  const errors: QuestionErrors = {}
  if (!draft.question_text.trim()) errors.question_text = 'Enter the question text.'
  const filled = filledOptions(draft.options)
  draft.options.forEach((opt, i) => {
    // A blank inside the filled range is a gap; the first two are always required.
    if (!opt.trim() && (i < filled.length || i < MIN_FILLED_OPTIONS)) {
      errors[`option_${i}`] = `Option ${String.fromCharCode(65 + i)} can’t be empty.`
    }
  })
  const ci = draft.correct_index
  if (!Number.isInteger(ci) || ci < 0 || ci >= filled.length) {
    errors.correct_index = 'Choose the correct answer.'
  } else if (ci > MAX_CORRECT_INDEX) {
    errors.correct_index = 'The correct answer must be one of the first four options.'
  }
  return errors
}

const sameOptions = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** Only the changed fields, in the PATCH body shape. */
export function questionPatch(initial: QuestionDraft, draft: QuestionDraft): Partial<QuestionDraft> {
  const patch: Partial<QuestionDraft> = {}
  if (draft.question_text !== initial.question_text) patch.question_text = draft.question_text
  const options = filledOptions(draft.options)
  if (!sameOptions(options, filledOptions(initial.options))) patch.options = options
  if (draft.correct_index !== initial.correct_index) patch.correct_index = draft.correct_index
  return patch
}

export function isDraftDirty(initial: QuestionDraft, draft: QuestionDraft): boolean {
  return Object.keys(questionPatch(initial, draft)).length > 0
}
