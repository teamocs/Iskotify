import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { flashcardSrs } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for Task H's flashcard_srs table (added via MIGRATIONS, not the
// base CREATE_SQL — see db/client.ts). Mirrors the
// questionAttempts.repro.test.ts pattern: run the REAL CREATE_SQL + MIGRATIONS
// against better-sqlite3 and prove the SQL is valid and matches
// db/schema.ts's flashcardSrs definition.
function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) }
}

describe('flashcard_srs — real CREATE_SQL + MIGRATIONS', () => {
  it('creates the table with its due_at index', () => {
    const { raw } = makeDb()
    const tables = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'flashcard_srs'`).all() as { name: string }[])
    expect(tables).toHaveLength(1)

    const indexNames = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'flashcard_srs'`).all() as { name: string }[])
      .map(i => i.name)
    expect(indexNames).toContain('flashcard_srs_due_at_idx')
  })

  it('matches db/schema.ts column shape: flashcard_id PK, 5 NOT NULL-with-default columns, 2 nullable', () => {
    const { raw } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(flashcard_srs)`).all() as {
      name: string; notnull: number; dflt_value: string | null; pk: number
    }[]
    const byName = Object.fromEntries(cols.map(c => [c.name, c]))

    expect(byName.flashcard_id?.pk).toBe(1)

    expect(byName.interval_days?.notnull).toBe(1)
    expect(byName.interval_days?.dflt_value).toBe('0')
    expect(byName.ease_factor?.notnull).toBe(1)
    expect(byName.ease_factor?.dflt_value).toBe('2.5')
    expect(byName.repetitions?.notnull).toBe(1)
    expect(byName.repetitions?.dflt_value).toBe('0')
    expect(byName.lapses?.notnull).toBe(1)
    expect(byName.lapses?.dflt_value).toBe('0')
    expect(byName.due_at?.notnull).toBe(1)
    expect(byName.due_at?.dflt_value).toBe('0')

    // Nullable — no review has happened yet / no grade recorded yet
    expect(byName.last_reviewed_at?.notnull).toBe(0)
    expect(byName.last_grade?.notnull).toBe(0)
  })

  it('round-trips an insert + select through Drizzle, including onConflictDoUpdate (the upsert useRecordSrs relies on)', async () => {
    const { db } = makeDb()

    await db.insert(flashcardSrs).values({
      flashcardId: 'f1',
      intervalDays: 1,
      easeFactor: 2.5,
      repetitions: 1,
      lapses: 0,
      dueAt: 1_700_100_000_000,
      lastReviewedAt: 1_700_000_000_000,
      lastGrade: 'good',
    })

    let rows = await db.select().from(flashcardSrs).where(eq(flashcardSrs.flashcardId, 'f1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ intervalDays: 1, easeFactor: 2.5, repetitions: 1, lastGrade: 'good' })

    // Second review — upsert on the same PK, mirroring useRecordSrs's read-modify-write.
    await db.insert(flashcardSrs)
      .values({
        flashcardId: 'f1',
        intervalDays: 3,
        easeFactor: 2.5,
        repetitions: 2,
        lapses: 0,
        dueAt: 1_700_400_000_000,
        lastReviewedAt: 1_700_200_000_000,
        lastGrade: 'good',
      })
      .onConflictDoUpdate({
        target: flashcardSrs.flashcardId,
        set: { intervalDays: 3, repetitions: 2, dueAt: 1_700_400_000_000, lastReviewedAt: 1_700_200_000_000, lastGrade: 'good' },
      })

    rows = await db.select().from(flashcardSrs).where(eq(flashcardSrs.flashcardId, 'f1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ intervalDays: 3, repetitions: 2, dueAt: 1_700_400_000_000 })

    // A never-reviewed card has no row at all.
    const missing = await db.select().from(flashcardSrs).where(eq(flashcardSrs.flashcardId, 'never-reviewed'))
    expect(missing).toHaveLength(0)
  })
})
