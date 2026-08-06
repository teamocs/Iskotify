import { useDb } from './useDb'
import { userProgress } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'

export interface ProgressRow {
  flashcardId: string
  correct: boolean
  answeredAt: number
}

/**
 * useRecordProgress — fixes the user_progress producer gap (Task D): before
 * this, only FlashcardExam's practice_sessions row was written on submit, so
 * user_progress (weak-topic detection, today-accuracy, half the streak
 * UNION — see homeAggregates.ts) had no live writer and stayed empty on a
 * fresh device (export.ts restore / sync.ts pull were the only writers).
 * FlashcardExam.submit now calls this alongside recordSession/recordAttempts
 * to insert one row per card in the run.
 */
export function useRecordProgress() {
  const db = useDb()

  async function recordProgress(rows: ProgressRow[]): Promise<void> {
    if (rows.length === 0) return
    await db.insert(userProgress).values(rows)
    scheduleWebPersist()
  }

  return { recordProgress }
}
