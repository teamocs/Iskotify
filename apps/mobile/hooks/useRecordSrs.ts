import { useEffect, useState } from 'react'
import { inArray } from 'drizzle-orm'
import { useDb } from './useDb'
import { flashcardSrs } from '../db/schema'
import type { DrizzleClient } from '../db/client'
import { scheduleWebPersist } from '../db/webPersist'
import { invalidate } from '../services/queryCache'
import { applyReview, scheduleReview, type Grade, type SrsCardState } from '../utils/srs'
import { markPlanItemsDoneForSrsReview } from '../services/studyPlan'

export interface SrsReviewInput {
  flashcardId: string
  correct: boolean
  /** Cumulative dwell time on the question, from utils/attemptTiming.ts. */
  elapsedMs: number
  /**
   * A self-graded review (components/practice/FlashcardStack): when given it
   * is scheduled as-is and `correct`/`elapsedMs` are not used to derive one.
   */
  grade?: Grade
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
    // Reviews that actually advanced a schedule (new card, or due now).
    let scheduledCount = 0

    for (const review of reviews) {
      const existingRow = existingById.get(review.flashcardId)
      // The ladder assumes one review per due date: a card that isn't due yet
      // keeps its schedule (re-answering it in a topic quiz must neither push it
      // up the ladder nor lapse it).
      if (existingRow && existingRow.dueAt > now) continue
      scheduledCount++
      const prior = existingRow ? rowToState(existingRow) : null
      const nextState = review.grade
        ? scheduleReview(prior, review.grade, now)
        : applyReview(prior, review.correct, review.elapsedMs, now)
      await db.insert(flashcardSrs)
        .values({ flashcardId: review.flashcardId, ...nextState })
        .onConflictDoUpdate({ target: flashcardSrs.flashcardId, set: nextState })
    }

    if (scheduledCount === 0) return

    scheduleWebPersist()

    // Task I: best-effort "Today's Plan" mark-done bookkeeping. Fire-and-forget
    // — the real flashcard_srs upserts above are already committed, so a
    // failure here must never surface to the caller (same convention as
    // useRecordSession's markPlanItemsDoneForSession call).
    void markPlanItemsDoneForSrsReview(db, scheduledCount)
      .then(() => invalidate('home:'))
      .catch(err => console.warn('[useRecordSrs] plan bookkeeping failed:', err))
  }

  return { recordSrs }
}

/**
 * readSrsStates — the stored schedule for each of `ids` that has a
 * flashcard_srs row. An id with no row (never reviewed) is absent; callers
 * treat it as utils/srs.ts's newSrsState() (previewIntervals(null, …)).
 */
export async function readSrsStates(db: DrizzleClient, ids: string[]): Promise<Map<string, SrsCardState>> {
  if (ids.length === 0) return new Map()
  const rows = await db.select().from(flashcardSrs).where(inArray(flashcardSrs.flashcardId, ids))
  return new Map(rows.map(r => [r.flashcardId, rowToState(r)]))
}

/**
 * useSrsStates — readSrsStates for a review queue, so the card stack can show
 * each grade's next interval from the card's real schedule. Read once per id
 * set; a failed read leaves the map empty and `loaded` false (the stack then
 * shows the grades without intervals rather than inventing them).
 */
export function useSrsStates(ids: string[]): { states: Map<string, SrsCardState>; loaded: boolean } {
  const db = useDb()
  const key = JSON.stringify(ids)
  const [result, setResult] = useState<{ key: string | null; states: Map<string, SrsCardState> }>({ key: null, states: new Map() })

  useEffect(() => {
    let alive = true
    readSrsStates(db, JSON.parse(key) as string[])
      .then(states => { if (alive) setResult({ key, states }) })
      .catch(err => console.warn('[useSrsStates] read failed:', err))
    return () => { alive = false }
  }, [db, key])

  return result.key === key ? { states: result.states, loaded: true } : { states: new Map(), loaded: false }
}
