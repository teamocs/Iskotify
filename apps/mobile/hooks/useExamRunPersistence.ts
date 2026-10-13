import { useCallback, useMemo } from 'react'
import { useDb } from './useDb'
import { saveExamRun, loadExamRun, clearExamRun, type ExamRunState, type LoadedExamRun } from '../services/examRuns'

/**
 * Thin useDb()-bound wrapper around services/examRuns.ts, mirroring
 * useRecordAttempts.ts's convention — lets exam-screen tests mock this one
 * hook module instead of standing up a real SQLite db (services/examRuns.ts
 * itself is exercised against a real in-memory db in
 * services/__tests__/examRuns.test.ts).
 *
 * The functions keep their identity while `db` does: the exam runners list
 * saveRun in their autosave effect's deps and re-render on every 1 Hz timer
 * tick, so a new identity per render would write the run every second.
 */
export function useExamRunPersistence() {
  const db = useDb()
  const saveRun = useCallback((state: ExamRunState): Promise<void> => saveExamRun(db, state), [db])
  const loadRun = useCallback((runKey: string): Promise<LoadedExamRun | null> => loadExamRun(db, runKey), [db])
  const clearRun = useCallback((runKey: string): Promise<void> => clearExamRun(db, runKey), [db])
  return useMemo(() => ({ saveRun, loadRun, clearRun }), [saveRun, loadRun, clearRun])
}
