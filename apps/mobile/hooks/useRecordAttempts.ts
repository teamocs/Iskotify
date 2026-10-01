import { useDb } from './useDb'
import { questionAttempts } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import type { QuestionAttemptRow } from '../utils/attemptRows'

import { pruneOldAttempts } from '../services/pruneAttempts'

// Kept exported from here for existing importers; the implementation lives in the service layer.
export { pruneOldAttempts }

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
 *
 * pruneOldAttempts() is fired-and-forgotten (not awaited) — same convention
 * as useRecordSession.ts's `void pushUserData(db).catch(...)` for post-write
 * housekeeping that must never block or break the caller. All four engines'
 * submit() do `await recordAttempts(rows)` with no try/catch and flip
 * submittedRef BEFORE that await, so a transient prune COUNT/DELETE error
 * must never reject recordAttempts() — that would permanently strand the
 * student on the exam screen behind the double-submit guard. The attempt
 * insert above is real user data and still surfaces its own errors.
 */
export function useRecordAttempts() {
  const db = useDb()

  async function recordAttempts(rows: QuestionAttemptRow[]): Promise<void> {
    if (rows.length === 0) return
    await db.insert(questionAttempts).values(rows)
    void pruneOldAttempts(db).catch(err => console.warn('[recordAttempts] prune failed:', err))
    scheduleWebPersist()
  }

  return { recordAttempts }
}
