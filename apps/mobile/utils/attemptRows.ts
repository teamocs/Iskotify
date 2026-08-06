// Pure question_attempts row-builder shared by all four practice engines.
// No React/DB — an engine passes its flat question list + answers + a
// per-index elapsed-ms map (from attemptTiming.ts) and gets back rows ready
// for hooks/useRecordAttempts's insert. Keeps the four submit() call sites
// thin instead of scattering row-shaping logic across each screen.

export type AttemptSourceTable = 'upcat_questions' | 'flashcards'

/** The bits of a question an engine needs to supply per attempt row. */
export interface AttemptQuestionMeta {
  questionId: string
  correctIndex: number
  subtest?: string | null
  topic?: string | null
}

export interface QuestionAttemptRow {
  sessionKey: number
  sourceTable: AttemptSourceTable
  questionId: string
  listingSlug: string
  subtest: string | null
  topic: string | null
  selectedIndex: number | null
  correctIndex: number
  correct: boolean
  elapsedMs: number
  answeredAt: number
}

export interface BuildAttemptRowsParams {
  /** Attempt start ms — groups every row from one exam run under one key. */
  sessionKey: number
  sourceTable: AttemptSourceTable
  listingSlug: string
  questions: AttemptQuestionMeta[]
  /** Keyed by the SAME flat index as `questions` — i.e. answers[i] answers questions[i]. */
  answers: Record<number, number>
  /** Keyed by the same flat index; ms spent on that question (attemptTiming.ts). */
  elapsedByIdx: Record<number, number>
  /** Defaults to Date.now(); pass explicitly in tests for determinism. */
  answeredAt?: number
}

/**
 * buildAttemptRows — one row per question in the run, in order. A skipped
 * question (no entry in `answers`) still gets a row (selectedIndex: null,
 * correct: false) so its time-spent is captured and it doesn't silently
 * disappear from "most common mistakes" — this mirrors how every engine's
 * own scoring already treats an unanswered question as not-correct.
 */
export function buildAttemptRows(params: BuildAttemptRowsParams): QuestionAttemptRow[] {
  const answeredAt = params.answeredAt ?? Date.now()
  return params.questions.map((q, i) => {
    const selectedIndex = params.answers[i] ?? null
    return {
      sessionKey: params.sessionKey,
      sourceTable: params.sourceTable,
      questionId: q.questionId,
      listingSlug: params.listingSlug,
      subtest: q.subtest ?? null,
      topic: q.topic ?? null,
      selectedIndex,
      correctIndex: q.correctIndex,
      correct: selectedIndex !== null && selectedIndex === q.correctIndex,
      elapsedMs: params.elapsedByIdx[i] ?? 0,
      answeredAt,
    }
  })
}
