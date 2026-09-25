import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { userSettings } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for user_settings.onboarding_step (added via MIGRATIONS): the
// furthest onboarding step reached, so a relaunch resumes past optional steps
// that were skipped. Runs the REAL CREATE_SQL + MIGRATIONS, twice (they re-run
// on every launch), and round-trips the value through db/schema.ts.
function makeDb() {
  const raw = new Database(':memory:')
  for (let pass = 0; pass < 2; pass++) {
    raw.exec(CREATE_SQL)
    for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  }
  return { raw, db: drizzle(raw, { schema }) }
}

describe('user_settings.onboarding_step — real CREATE_SQL + MIGRATIONS', () => {
  it('exists as TEXT NOT NULL DEFAULT empty', () => {
    const { raw } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(user_settings)`).all() as {
      name: string; type: string; notnull: number; dflt_value: string | null
    }[]
    const col = cols.find(c => c.name === 'onboarding_step')
    expect(col).toMatchObject({ type: 'TEXT', notnull: 1, dflt_value: "''" })
  })

  it('round-trips through the drizzle schema', async () => {
    const { db } = makeDb()
    await db.insert(userSettings).values({ id: 1 })
    let rows = await db.select().from(userSettings).where(eq(userSettings.id, 1))
    expect(rows[0]!.onboardingStep).toBe('')
    await db.update(userSettings).set({ onboardingStep: 'gwa' }).where(eq(userSettings.id, 1))
    rows = await db.select().from(userSettings).where(eq(userSettings.id, 1))
    expect(rows[0]!.onboardingStep).toBe('gwa')
  })
})
