import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { renderHook } from '@testing-library/react-native'
import * as schema from '../../db/schema'
import { questionAttempts } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pruneOldAttempts, useRecordAttempts } from '../useRecordAttempts'
import type { QuestionAttemptRow } from '../../utils/attemptRows'

// useRecordAttempts() (the hook, exercised below) reads its db via useDb() —
// stub it so we can hand each test its own controllable in-memory db.
let mockDb: DrizzleClient | null = null
jest.mock('../useDb', () => ({ useDb: () => mockDb }))

// Real in-memory db (same pattern as db/__tests__/*.repro.test.ts) so the
// prune wiring's actual DELETE/orderBy/limit SQL executes for real, not a
// mocked db.insert()/delete() that would let an off-by-one or wrong ORDER BY
// slip through unnoticed.
function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  // Cast — better-sqlite3 adapter satisfies the same Drizzle query API at
  // runtime. The DrizzleClient type comes from the expo-sqlite adapter in
  // production (see services/__tests__/coachQueue.test.ts for precedent).
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

// Same as makeDb(), but also hands back the raw better-sqlite3 handle so a
// test can verify inserted rows directly via SQL even after db.select() has
// been stubbed out to simulate a prune failure.
function makeDbWithRaw(): { raw: Database.Database; db: DrizzleClient } {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}

function row(overrides: Partial<QuestionAttemptRow> & { answeredAt: number; questionId: string }): QuestionAttemptRow {
  return {
    sessionKey: 1,
    sourceTable: 'upcat_questions',
    listingSlug: '',
    subtest: null,
    topic: null,
    selectedIndex: null,
    correctIndex: 0,
    correct: false,
    elapsedMs: 0,
    ...overrides,
  }
}

describe('pruneOldAttempts', () => {
  it('does nothing when the table is under the cap (no DELETE executed)', async () => {
    const db = makeDb()
    await db.insert(questionAttempts).values([
      row({ questionId: 'q1', answeredAt: 1 }),
      row({ questionId: 'q2', answeredAt: 2 }),
    ])
    await pruneOldAttempts(db, 5)
    const rows = await db.select().from(questionAttempts)
    expect(rows).toHaveLength(2)
  })

  it('does nothing when the table is exactly at the cap', async () => {
    const db = makeDb()
    await db.insert(questionAttempts).values([
      row({ questionId: 'q1', answeredAt: 1 }),
      row({ questionId: 'q2', answeredAt: 2 }),
      row({ questionId: 'q3', answeredAt: 3 }),
    ])
    await pruneOldAttempts(db, 3)
    const rows = await db.select().from(questionAttempts)
    expect(rows).toHaveLength(3)
  })

  it('deletes only the oldest rows by answeredAt, keeping the most recent `cap` rows', async () => {
    const db = makeDb()
    await db.insert(questionAttempts).values([
      row({ questionId: 'oldest', answeredAt: 100 }),
      row({ questionId: 'middle', answeredAt: 200 }),
      row({ questionId: 'newer', answeredAt: 300 }),
      row({ questionId: 'newest', answeredAt: 400 }),
    ])
    await pruneOldAttempts(db, 2)
    const rows = await db.select().from(questionAttempts)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.questionId).sort()).toEqual(['newer', 'newest'])
  })

  it('is insertion-order independent — orders strictly by answeredAt, not row id', async () => {
    const db = makeDb()
    // Insert out of chronological order.
    await db.insert(questionAttempts).values([
      row({ questionId: 'newest', answeredAt: 400 }),
      row({ questionId: 'oldest', answeredAt: 100 }),
      row({ questionId: 'newer', answeredAt: 300 }),
      row({ questionId: 'middle', answeredAt: 200 }),
    ])
    await pruneOldAttempts(db, 1)
    const rows = await db.select().from(questionAttempts)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.questionId).toBe('newest')
  })

  it('defaults to MAX_RETAINED_ATTEMPTS when no cap is passed (no prune for a small table)', async () => {
    const db = makeDb()
    await db.insert(questionAttempts).values([row({ questionId: 'q1', answeredAt: 1 })])
    await pruneOldAttempts(db)
    const rows = await db.select().from(questionAttempts)
    expect(rows).toHaveLength(1)
  })
})

// Critical-severity fix: a transient prune COUNT/DELETE error used to
// propagate out of recordAttempts() unguarded. Every engine's submit() does
// `await recordAttempts(rows)` with NO try/catch and flips submittedRef to
// true BEFORE that await — so a rejected recordAttempts() means
// setPhase('results') never runs and the double-submit guard permanently
// strands the student on the exam screen, even though their attempt rows
// were already committed. Pruning is pure housekeeping and must never be
// able to break the submit flow.
describe('useRecordAttempts — prune failure is isolated from the caller', () => {
  let warnSpy: jest.SpyInstance

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    mockDb = null
  })

  it('recordAttempts() still resolves — and the rows are still inserted — when the prune query throws', async () => {
    const { raw, db } = makeDbWithRaw()
    mockDb = db
    // Simulate a transient SQLite error surfacing from pruneOldAttempts's
    // COUNT query (the first thing it does).
    jest.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('SQLITE_BUSY: transient prune failure')
    })

    const { result } = renderHook(() => useRecordAttempts())
    const rows: QuestionAttemptRow[] = [row({ questionId: 'q1', answeredAt: 1 })]

    // This is the RED assertion: on the pre-fix code (`await pruneOldAttempts(db)`
    // with no catch), this promise rejects and the test fails here.
    await expect(result.current.recordAttempts(rows)).resolves.toBeUndefined()

    // The attempt insert itself must not have been swallowed — query the raw
    // handle directly since db.select() above is stubbed to throw.
    const inserted = raw.prepare('SELECT question_id FROM question_attempts').all() as { question_id: string }[]
    expect(inserted).toHaveLength(1)
    expect(inserted[0]?.question_id).toBe('q1')

    expect(warnSpy).toHaveBeenCalledWith('[recordAttempts] prune failed:', expect.any(Error))
  })

  it('does not await the prune settling — recordAttempts resolves while the prune query is still pending', async () => {
    const { db } = makeDbWithRaw()
    mockDb = db
    const deferred: { reject?: (err: Error) => void } = {}
    const pruneGate = new Promise<never>((_resolve, reject) => { deferred.reject = reject })
    jest.spyOn(db, 'select').mockImplementation((() => ({ from: () => pruneGate })) as unknown as typeof db.select)

    const { result } = renderHook(() => useRecordAttempts())
    const rows: QuestionAttemptRow[] = [row({ questionId: 'q1', answeredAt: 1 })]

    // If recordAttempts() awaited the prune, this would hang until the gate
    // settles — it never does within this call, proving fire-and-forget.
    await expect(result.current.recordAttempts(rows)).resolves.toBeUndefined()
    expect(warnSpy).not.toHaveBeenCalled()

    // Now let the deferred prune reject and flush microtasks — the failure
    // must surface only as a swallowed, logged warning, never a rejection.
    deferred.reject?.(new Error('deferred prune failure'))
    await new Promise(r => setTimeout(r, 0))
    expect(warnSpy).toHaveBeenCalledWith('[recordAttempts] prune failed:', expect.any(Error))
  })

  it('still surfaces the attempt insert error (not blanket-swallowed) when the insert itself fails', async () => {
    const { db } = makeDbWithRaw()
    mockDb = db
    jest.spyOn(db, 'insert').mockImplementation(() => {
      throw new Error('SQLITE_CONSTRAINT: insert failed')
    })

    const { result } = renderHook(() => useRecordAttempts())
    const rows: QuestionAttemptRow[] = [row({ questionId: 'q1', answeredAt: 1 })]

    await expect(result.current.recordAttempts(rows)).rejects.toThrow('SQLITE_CONSTRAINT: insert failed')
  })
})
