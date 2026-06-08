import { VALID_SUBTESTS } from './importUpcatCore'

// The snake_case columns the UPCAT importer (and the /api/upcat-questions/import
// route) expect, in order. The admin editor regenerates a CSV with exactly these
// columns, so the server's header check always passes. Friendly tracker headers
// are mapped to these by normalizeQuestionBankHeader before validation.
export const EXPECTED_COLUMNS = [
  'question_id', 'subtest', 'main_subject', 'topic', 'subtopic', 'question_format',
  'cognitive_level', 'difficulty', 'curriculum_alignment', 'has_visual', 'visual_type',
  'visual_description', 'set_id', 'set_position', 'passage_text', 'question_text',
  'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer', 'explanation', 'status',
] as const

export interface QbFieldError { field: string; message: string }

/**
 * Normalize an answer cell to a canonical option letter. Accepts A–D (any case)
 * and 1–4. Returns null when it is not a recognizable option reference — the same
 * letters importUpcatCore's letterToIndex accepts, so a row that validates here
 * will not throw on the server.
 */
export function normalizeAnswerLetter(raw: string | null | undefined): 'A' | 'B' | 'C' | 'D' | null {
  const v = (raw ?? '').trim().toUpperCase()
  if (v === 'A' || v === 'B' || v === 'C' || v === 'D') return v
  if (v === '1' || v === '2' || v === '3' || v === '4') return (['A', 'B', 'C', 'D'][Number(v) - 1]) as 'A' | 'B' | 'C' | 'D'
  return null
}

const OPTION_KEY: Record<'A' | 'B' | 'C' | 'D', string> = {
  A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d',
}

/**
 * Validate a single (normalized, snake_case) Question Bank row. Returns one entry
 * per problem; an empty array means the row is importable. Mirrors the server's
 * rules (subtest must be one of VALID_SUBTESTS, answer must resolve to A–D) so the
 * admin can fix every error in-app before importing and never hit a 500.
 *
 * Pass `idCounts` (question_id -> occurrences across the whole file) to flag
 * duplicate IDs, which would silently overwrite each other on upsert.
 */
export function validateQbRow(
  row: Record<string, string>,
  ctx?: { idCounts?: Map<string, number> },
): QbFieldError[] {
  const errs: QbFieldError[] = []
  const get = (k: string) => (row[k] ?? '').trim()

  const qid = get('question_id')
  if (!qid) {
    errs.push({ field: 'question_id', message: 'Q ID is required' })
  } else if (ctx?.idCounts && (ctx.idCounts.get(qid) ?? 0) > 1) {
    errs.push({ field: 'question_id', message: 'Duplicate Q ID' })
  }

  const subtest = get('subtest')
  if (!subtest) {
    errs.push({ field: 'subtest', message: 'Subtest is required' })
  } else if (!(VALID_SUBTESTS as readonly string[]).includes(subtest)) {
    errs.push({ field: 'subtest', message: `Must be one of: ${VALID_SUBTESTS.join(', ')}` })
  }

  if (!get('question_text')) errs.push({ field: 'question_text', message: 'Question is required' })

  const letter = normalizeAnswerLetter(get('correct_answer'))
  if (!letter) errs.push({ field: 'correct_answer', message: 'Answer must be A, B, C, or D' })

  const optionValues = [get('option_a'), get('option_b'), get('option_c'), get('option_d')]
  const nonEmpty = optionValues.filter(Boolean).length
  if (nonEmpty < 2) errs.push({ field: 'options', message: 'At least 2 options are required' })
  if (letter && !get(OPTION_KEY[letter])) {
    errs.push({ field: OPTION_KEY[letter], message: `Option ${letter} (the answer) is empty` })
  }

  return errs
}

/** Count occurrences of each question_id across the file (for duplicate detection). */
export function countQuestionIds(rows: Array<Record<string, string>>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of rows) {
    const id = (r.question_id ?? '').trim()
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

/** Build the full errors-by-row index for a set of rows (1 pass + id counts). */
export function validateAllQbRows(rows: Array<Record<string, string>>): Map<number, QbFieldError[]> {
  const idCounts = countQuestionIds(rows)
  const byRow = new Map<number, QbFieldError[]>()
  rows.forEach((row, i) => {
    const errs = validateQbRow(row, { idCounts })
    if (errs.length) byRow.set(i, errs)
  })
  return byRow
}
