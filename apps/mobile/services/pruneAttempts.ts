import { asc, inArray, sql } from 'drizzle-orm'
import { questionAttempts } from '../db/schema'
import { computeAttemptsToPrune, MAX_RETAINED_ATTEMPTS } from '../utils/attemptRetention'
import type { DrizzleClient } from '../db/client'

/**
 * pruneOldAttempts — deletes the oldest question_attempts rows (by
 * answeredAt) once the table exceeds `cap`, keeping the most recent `cap`
 * rows. Bounds both on-device storage and the payload
 * services/sync.ts's pushUserData() re-sends in full on every push (see
 * utils/attemptRetention.ts for the retention rationale). Also run by
 * pullUserData after it merges remote attempts in.
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
