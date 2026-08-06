import { asc, inArray, sql } from 'drizzle-orm'
import { useDb } from './useDb'
import { questionAttempts } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import type { QuestionAttemptRow } from '../utils/attemptRows'
import { computeAttemptsToPrune, MAX_RETAINED_ATTEMPTS } from '../utils/attemptRetention'
import type { DrizzleClient } from '../db/client'

/**
 * pruneOldAttempts — deletes the oldest question_attempts rows (by
 * answeredAt) once the table exceeds `cap`, keeping the most recent `cap`
 * rows. Bounds both on-device storage and the payload
 * services/sync.ts's pushUserData() re-sends in full on every push (see
 * utils/attemptRetention.ts for the retention rationale).
 *
 * Cheap on the common case: a single COUNT(*) when under the cap, no DELETE.
 * The DELETE (a second SELECT for the oldest ids + a batch delete) only runs
 * once the cap is actually exceeded.
 */
export async function pruneOldAttempts(db: DrizzleClient, cap: number = MAX_RETAINED_ATTEMPTS): Promise<void> {
  const countRows = await db.select({ count: sql<number>`count(*)` }).from(questionAttempts)
  const totalCount = countRows[0]?.count ?? 0
  const toPrune = computeAttemptsToPrune(totalCount, cap)
  if (toPrune <= 0) return

  const oldest = await db.select({ id: questionAttempts.id })
    .from(questionAttempts)
    .orderBy(asc(questionAttempts.answeredAt))
    .limit(toPrune)
  const ids = oldest.map(r => r.id)
  if (ids.length === 0) return

  await db.delete(questionAttempts).where(inArray(questionAttempts.id, ids))
}

/**
 * useRecordAttempts — batch-inserts per-question telemetry rows built by
 * utils/attemptRows.ts's buildAttemptRows(). Called alongside (before)
 * useRecordSession's recordSession() in each engine's submit() so the rows
 * are committed before recordSession's fire-and-forget Supabase push reads
 * the local tables.
 *
 * Intentionally does its own DB write only — no cache invalidation/push here.
 * recordSession() (called right after, in the same submit()) already
 * invalidates analytics:/home:/practice: caches and pushes user_app_data;
 * duplicating that here would just double the work.
 */
export function useRecordAttempts() {
  const db = useDb()

  async function recordAttempts(rows: QuestionAttemptRow[]): Promise<void> {
    if (rows.length === 0) return
    await db.insert(questionAttempts).values(rows)
    await pruneOldAttempts(db)
    scheduleWebPersist()
  }

  return { recordAttempts }
}
