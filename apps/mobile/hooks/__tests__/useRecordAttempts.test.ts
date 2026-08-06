import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { questionAttempts } from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pruneOldAttempts } from '../useRecordAttempts'
import type { QuestionAttemptRow } from '../../utils/attemptRows'

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
