// Exam safety Fix 1 — DB-backed persistence for an in-progress timed run
// (mock exam, UPCAT subtest, diagnostic). See db/schema.ts's examRuns for the
// column rationale and utils/examRunPersistence.ts for the pure
// reconstruction helpers used once a saved run is loaded back.
import { eq } from 'drizzle-orm'
import { examRuns } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import { safeParseJson } from '../utils/examRunPersistence'
import type { DrizzleClient } from '../db/client'

export interface ExamRunState {
  runKey: string
  kind: string
  slug: string
  mode: string
  questionIds: string[]
  sectionNames: string[]
  answers: Record<number, number>
  idx: number
  sectionIdx: number
  floorIdx: number
  endTime: number | null
  sectionEndTime: number | null
  startedAt: number
}

export interface LoadedExamRun extends ExamRunState {
  updatedAt: number
}

/** Upserts the current run state, keyed by runKey. Called on every answer/nav
 *  change while a timed run is in progress (fire-and-forget at call sites —
 *  a save failure must never interrupt the exam). */
export async function saveExamRun(db: DrizzleClient, state: ExamRunState): Promise<void> {
  const row = {
    runKey: state.runKey,
    kind: state.kind,
    slug: state.slug,
    mode: state.mode,
    questionIds: JSON.stringify(state.questionIds),
    sectionNames: JSON.stringify(state.sectionNames),
    answers: JSON.stringify(state.answers),
    idx: state.idx,
    sectionIdx: state.sectionIdx,
    floorIdx: state.floorIdx,
    endTime: state.endTime,
    sectionEndTime: state.sectionEndTime,
    startedAt: state.startedAt,
    updatedAt: Date.now(),
  }
  await db.insert(examRuns).values(row).onConflictDoUpdate({ target: examRuns.runKey, set: row })
  scheduleWebPersist()
}

/** Returns the saved run for this key, or null if the student has no
 *  in-progress run (never started one, or already submitted/cleared it). */
export async function loadExamRun(db: DrizzleClient, runKey: string): Promise<LoadedExamRun | null> {
  const rows = await db.select().from(examRuns).where(eq(examRuns.runKey, runKey)).limit(1)
  const row = rows[0]
  if (!row) return null
  return {
    runKey: row.runKey,
    kind: row.kind,
    slug: row.slug,
    mode: row.mode,
    questionIds: safeParseJson<string[]>(row.questionIds, []),
    sectionNames: safeParseJson<string[]>(row.sectionNames, []),
    answers: safeParseJson<Record<number, number>>(row.answers, {}),
    idx: row.idx,
    sectionIdx: row.sectionIdx,
    floorIdx: row.floorIdx,
    endTime: row.endTime,
    sectionEndTime: row.sectionEndTime,
    startedAt: row.startedAt,
    updatedAt: row.updatedAt,
  }
}

/** Deletes the saved run — called on submit (finished, nothing to resume)
 *  and after a successful resume-reconstruction failure (nothing sane to
 *  offer next time). A no-op (never throws) when nothing is saved. */
export async function clearExamRun(db: DrizzleClient, runKey: string): Promise<void> {
  await db.delete(examRuns).where(eq(examRuns.runKey, runKey))
  scheduleWebPersist()
}
