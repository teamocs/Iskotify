import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { studyPlanItems, userSettings } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for Task I's study_plan_items table (added via MIGRATIONS, not
// the base CREATE_SQL — see db/client.ts). Mirrors the flashcardSrs.repro /
// questionAttempts.repro pattern: run the REAL CREATE_SQL + MIGRATIONS
// against better-sqlite3 and prove the SQL is valid and matches
// db/schema.ts's studyPlanItems definition.
function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  return { raw, db: drizzle(raw, { schema }) }
}

describe('study_plan_items — real CREATE_SQL + MIGRATIONS', () => {
  it('creates the table with its plan_date index', () => {
    const { raw } = makeDb()
    const tables = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'study_plan_items'`).all() as { name: string }[])
    expect(tables).toHaveLength(1)

    const indexNames = (raw.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'study_plan_items'`).all() as { name: string }[])
      .map(i => i.name)
    expect(indexNames).toContain('study_plan_items_plan_date_idx')
  })

  it('matches db/schema.ts column shape: id PK, plan_date/kind/ref_id/target_count/created_at NOT NULL, completed_at nullable', () => {
    const { raw } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(study_plan_items)`).all() as {
      name: string; notnull: number; dflt_value: string | null; pk: number
    }[]
    const byName = Object.fromEntries(cols.map(c => [c.name, c]))

    expect(byName.id?.pk).toBe(1)
    expect(byName.plan_date?.notnull).toBe(1)
    expect(byName.kind?.notnull).toBe(1)
    expect(byName.ref_id?.notnull).toBe(1)
    expect(byName.ref_id?.dflt_value).toBe("''")
    expect(byName.target_count?.notnull).toBe(1)
    expect(byName.target_count?.dflt_value).toBe('1')
    expect(byName.created_at?.notnull).toBe(1)

    // Nullable — no completion yet
    expect(byName.completed_at?.notnull).toBe(0)
  })

  it('round-trips an insert + select through Drizzle, including a completedAt update (the manual check-off / mark-done path)', async () => {
    const { db } = makeDb()

    await db.insert(studyPlanItems).values({
      planDate: '2026-08-06',
      kind: 'srs_review',
      refId: '',
      targetCount: 12,
      createdAt: 1_700_000_000_000,
    })

    let rows = await db.select().from(studyPlanItems).where(eq(studyPlanItems.planDate, '2026-08-06'))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'srs_review', targetCount: 12, completedAt: null })

    await db.update(studyPlanItems)
      .set({ completedAt: 1_700_100_000_000 })
      .where(eq(studyPlanItems.id, rows[0]!.id))

    rows = await db.select().from(studyPlanItems).where(eq(studyPlanItems.planDate, '2026-08-06'))
    expect(rows[0]!.completedAt).toBe(1_700_100_000_000)

    // A different plan date has no rows at all.
    const other = await db.select().from(studyPlanItems).where(eq(studyPlanItems.planDate, '2026-08-07'))
    expect(other).toHaveLength(0)
  })

  it('user_settings gains daily_reminder_hour (default 9) and weekly_summary_enabled (default true)', async () => {
    const { raw, db } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(user_settings)`).all() as {
      name: string; notnull: number; dflt_value: string | null
    }[]
    const byName = Object.fromEntries(cols.map(c => [c.name, c]))
    expect(byName.daily_reminder_hour?.notnull).toBe(1)
    expect(byName.daily_reminder_hour?.dflt_value).toBe('9')
    expect(byName.weekly_summary_enabled?.notnull).toBe(1)
    expect(byName.weekly_summary_enabled?.dflt_value).toBe('1')

    await db.insert(userSettings).values({ id: 1 })
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1))
    expect(rows[0]).toMatchObject({ dailyReminderHour: 9, weeklySummaryEnabled: true })
  })
})
