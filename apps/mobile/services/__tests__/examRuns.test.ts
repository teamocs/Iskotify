import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { saveExamRun, loadExamRun, clearExamRun, type ExamRunState } from '../examRuns'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

function state(overrides: Partial<ExamRunState> = {}): ExamRunState {
  return {
    runKey: 'exam:upcat',
    kind: 'exam',
    slug: 'upcat',
    mode: 'full',
    questionIds: ['q1', 'q2'],
    sectionNames: ['Math', 'Math'],
    answers: { 0: 1 },
    idx: 1,
    sectionIdx: 0,
    floorIdx: 0,
    endTime: 1_700_000_100_000,
    sectionEndTime: null,
    startedAt: 1_700_000_000_000,
    ...overrides,
  }
}

describe('examRuns persistence service', () => {
  it('loadExamRun returns null when nothing is saved for that key', async () => {
    const db = makeDb()
    expect(await loadExamRun(db, 'exam:upcat')).toBeNull()
  })

  it('round-trips a saved run', async () => {
    const db = makeDb()
    await saveExamRun(db, state())
    const loaded = await loadExamRun(db, 'exam:upcat')
    expect(loaded).toMatchObject({
      runKey: 'exam:upcat', kind: 'exam', slug: 'upcat', mode: 'full',
      questionIds: ['q1', 'q2'], sectionNames: ['Math', 'Math'],
      answers: { 0: 1 }, idx: 1, sectionIdx: 0, floorIdx: 0,
      endTime: 1_700_000_100_000, sectionEndTime: null,
      startedAt: 1_700_000_000_000,
    })
  })

  it('re-saving the same runKey overwrites rather than duplicating (upsert)', async () => {
    const db = makeDb()
    await saveExamRun(db, state({ idx: 0, answers: {} }))
    await saveExamRun(db, state({ idx: 5, answers: { 0: 2, 1: 3 } }))
    const loaded = await loadExamRun(db, 'exam:upcat')
    expect(loaded?.idx).toBe(5)
    expect(loaded?.answers).toEqual({ 0: 2, 1: 3 })
  })

  it('clearExamRun deletes the row (called on submit)', async () => {
    const db = makeDb()
    await saveExamRun(db, state())
    await clearExamRun(db, 'exam:upcat')
    expect(await loadExamRun(db, 'exam:upcat')).toBeNull()
  })

  it('clearExamRun on a non-existent key is a no-op (never throws)', async () => {
    const db = makeDb()
    await expect(clearExamRun(db, 'exam:does-not-exist')).resolves.not.toThrow()
  })

  it('keeps separate runs for different keys independent', async () => {
    const db = makeDb()
    await saveExamRun(db, state({ runKey: 'upcat:all:full', kind: 'upcat', idx: 3 }))
    await saveExamRun(db, state({ runKey: 'diagnostic:Science', kind: 'diagnostic', idx: 7 }))
    expect((await loadExamRun(db, 'upcat:all:full'))?.idx).toBe(3)
    expect((await loadExamRun(db, 'diagnostic:Science'))?.idx).toBe(7)
  })
})
