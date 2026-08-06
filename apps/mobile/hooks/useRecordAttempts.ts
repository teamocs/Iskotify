import { useDb } from './useDb'
import { questionAttempts } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import type { QuestionAttemptRow } from '../utils/attemptRows'

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
    scheduleWebPersist()
  }

  return { recordAttempts }
}
