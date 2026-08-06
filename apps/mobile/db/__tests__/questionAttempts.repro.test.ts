import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { questionAttempts } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for Task D's question_attempts table (added via MIGRATIONS, not
// the base CREATE_SQL — see db/client.ts). All of question_attempts's other
// tests mock the db entirely (buildAttemptRows is pure; useRecordAttempts is
// jest.mock'd in the four engine submit tests), so this raw CREATE TABLE +
// index SQL has never actually executed in the suite until now. Mirrors the
// examBlueprints.repro.test.ts / universityReqsQuals.repro.test.ts pattern:
// run the REAL CREATE_SQL + MIGRATIONS against better-sqlite3 and prove the
// SQL is valid and matches db/schema.ts's questionAttempts definition.
function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) }
}

describe('question_attempts — real CREATE_SQL + MIGRATIONS', () => {
  it('creates the table with both indexes', () => {
    const { raw } = makeDb()
    const tables = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'question_attempts'`).all() as { name: string }[])
    expect(tables).toHaveLength(1)

    const indexNames = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'question_attempts'`).all() as { name: string }[])
      .map(i => i.name)
    expect(indexNames).toContain('question_attempts_answered_at_idx')
    expect(indexNames).toContain('question_attempts_question_id_idx')
  })

  it('matches db/schema.ts column shape: 7 NOT NULL columns (incl. 2 with defaults) + 4 nullable columns', () => {
    const { raw } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(question_attempts)`).all() as {
      name: string; notnull: number; dflt_value: string | null; pk: number
    }[]
    const byName = Object.fromEntries(cols.map(c => [c.name, c]))

    // NOT NULL, no default — must be supplied by the caller
    expect(byName.session_key?.notnull).toBe(1)
    expect(byName.source_table?.notnull).toBe(1)
    expect(byName.question_id?.notnull).toBe(1)
    expect(byName.correct_index?.notnull).toBe(1)
    expect(byName.correct?.notnull).toBe(1)
    expect(byName.answered_at?.notnull).toBe(1)

    // NOT NULL WITH a default — matches schema.ts's .notNull().default(...)
    expect(byName.listing_slug?.notnull).toBe(1)
    expect(byName.listing_slug?.dflt_value).toBe("''")
    expect(byName.elapsed_ms?.notnull).toBe(1)
    expect(byName.elapsed_ms?.dflt_value).toBe('0')

    // Nullable columns — the skipped-question / no-subtest-or-topic case
    expect(byName.subtest?.notnull).toBe(0)
    expect(byName.topic?.notnull).toBe(0)
    expect(byName.selected_index?.notnull).toBe(0)

    // Primary key
    expect(byName.id?.pk).toBe(1)
  })

  it('round-trips an insert + select through Drizzle, including a skipped question (selectedIndex null)', async () => {
    const { db } = makeDb()

    await db.insert(questionAttempts).values([
      {
        sessionKey: 1700000000000,
        sourceTable: 'upcat_questions',
        questionId: 'q1',
        listingSlug: 'upcat',
        subtest: 'Mathematics',
        topic: 'Algebra',
        selectedIndex: 1,
        correctIndex: 1,
        correct: true,
        elapsedMs: 4200,
        answeredAt: 1700000010000,
      },
      // Skipped question: no selectedIndex, still gets a row so it doesn't
      // silently disappear from "most common mistakes" analytics.
      {
        sessionKey: 1700000000000,
        sourceTable: 'upcat_questions',
        questionId: 'q2',
        listingSlug: 'upcat',
        correctIndex: 0,
        correct: false,
        answeredAt: 1700000020000,
      },
    ])

    const rows = await db.select().from(questionAttempts).where(eq(questionAttempts.sessionKey, 1700000000000))
    expect(rows).toHaveLength(2)

    const answered = rows.find(r => r.questionId === 'q1')
    expect(answered?.selectedIndex).toBe(1)
    expect(answered?.correct).toBe(true)
    expect(answered?.elapsedMs).toBe(4200)

    const skipped = rows.find(r => r.questionId === 'q2')
    expect(skipped?.selectedIndex).toBeNull()
    expect(skipped?.correct).toBe(false)
    // listingSlug/elapsedMs defaults apply even when the caller omits them
    expect(skipped?.elapsedMs).toBe(0)
    expect(skipped?.subtest).toBeNull()
    expect(skipped?.topic).toBeNull()
  })
})
