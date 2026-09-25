import { useDb } from './useDb'
import { saveExamRun, loadExamRun, clearExamRun, type ExamRunState, type LoadedExamRun } from '../services/examRuns'

/**
 * Thin useDb()-bound wrapper around services/examRuns.ts, mirroring
 * useRecordAttempts.ts's convention — lets exam-screen tests mock this one
 * hook module instead of standing up a real SQLite db (services/examRuns.ts
 * itself is exercised against a real in-memory db in
 * services/__tests__/examRuns.test.ts).
 */
export function useExamRunPersistence() {
  const db = useDb()
  return {
    saveRun: (state: ExamRunState): Promise<void> => saveExamRun(db, state),
    loadRun: (runKey: string): Promise<LoadedExamRun | null> => loadExamRun(db, runKey),
    clearRun: (runKey: string): Promise<void> => clearExamRun(db, runKey),
  }
}
