import { inArray } from 'drizzle-orm'
import { useDb } from './useDb'
import { flashcardSrs } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import { invalidate } from '../services/queryCache'
import { applyReview, type Grade, type SrsCardState } from '../utils/srs'
import { markPlanItemsDoneForSrsReview } from '../services/studyPlan'

export interface SrsReviewInput {
  flashcardId: string
  correct: boolean
  /** Cumulative dwell time on the question, from utils/attemptTiming.ts. */
  elapsedMs: number
}

function rowToState(row: typeof flashcardSrs.$inferSelect): SrsCardState {
  return {
    intervalDays: row.intervalDays,
    easeFactor: row.easeFactor,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.dueAt,
    lastReviewedAt: row.lastReviewedAt,
    lastGrade: row.lastGrade as Grade | null,
  }
}

/**
 * useRecordSrs — Task H: read-modify-write flashcard_srs for each card
 * reviewed in a run, via utils/srs.ts's pure applyReview(). One row per
 * flashcardId (upsert); a card with no prior row is treated as never
 * reviewed (utils/srs.ts's newSrsState()).
 *
 * Called from FlashcardExam.submit() as fire-and-forget bookkeeping (`void
 * recordSrs(...).catch(...)`) — same error-isolation convention as
 * useRecordSession's recordSession call and useRecordAttempts's
 * pruneOldAttempts: a failure here must never break the submit flow, since
 * the user_progress + question_attempts rows (awaited, unguarded) are the
 * real record of the attempt and SRS scheduling is derived from them.
 */
export function useRecordSrs() {
  const db = useDb()

  async function recordSrs(reviews: SrsReviewInput[]): Promise<void> {
    if (reviews.length === 0) return

    const ids = reviews.map(r => r.flashcardId)
    const existingRows = await db.select().from(flashcardSrs).where(inArray(flashcardSrs.flashcardId, ids))
    const existingById = new Map(existingRows.map(r => [r.flashcardId, r]))
    const now = Date.now()

    for (const review of reviews) {
      const existingRow = existingById.get(review.flashcardId)
      const nextState = applyReview(
        existingRow ? rowToState(existingRow) : null,
        review.correct,
        review.elapsedMs,
        now,
      )
      await db.insert(flashcardSrs)
        .values({ flashcardId: review.flashcardId, ...nextState })
        .onConflictDoUpdate({ target: flashcardSrs.flashcardId, set: nextState })
    }

    scheduleWebPersist()

    // Task I: best-effort "Today's Plan" mark-done bookkeeping. Fire-and-forget
    // — the real flashcard_srs upserts above are already committed, so a
    // failure here must never surface to the caller (same convention as
    // useRecordSession's markPlanItemsDoneForSession call).
    void markPlanItemsDoneForSrsReview(db, reviews.length)
      .then(() => invalidate('home:'))
      .catch(err => console.warn('[useRecordSrs] plan bookkeeping failed:', err))
  }

  return { recordSrs }
}
