import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { userSettings } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for user_settings.profile_prompt_dismissed_at (added via
// MIGRATIONS): when Today's scholarship-profile prompt was dismissed. Runs the
// REAL CREATE_SQL + MIGRATIONS twice (they re-run on every launch).
function makeDb() {
  const raw = new Database(':memory:')
  for (let pass = 0; pass < 2; pass++) {
    raw.exec(CREATE_SQL)
    for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  }
  return { raw, db: drizzle(raw, { schema }) }
}

describe('user_settings.profile_prompt_dismissed_at — real CREATE_SQL + MIGRATIONS', () => {
  it('exists as INTEGER NOT NULL DEFAULT 0', () => {
    const { raw } = makeDb()
    const cols = raw.prepare(`PRAGMA table_info(user_settings)`).all() as {
      name: string; type: string; notnull: number; dflt_value: string | null
    }[]
    expect(cols.find(c => c.name === 'profile_prompt_dismissed_at')).toMatchObject({ type: 'INTEGER', notnull: 1, dflt_value: '0' })
  })

  it('round-trips through the drizzle schema', async () => {
    const { db } = makeDb()
    await db.insert(userSettings).values({ id: 1 })
    let rows = await db.select().from(userSettings).where(eq(userSettings.id, 1))
    expect(rows[0]!.profilePromptDismissedAt).toBe(0)
    await db.update(userSettings).set({ profilePromptDismissedAt: 1_760_000_000_000 }).where(eq(userSettings.id, 1))
    rows = await db.select().from(userSettings).where(eq(userSettings.id, 1))
    expect(rows[0]!.profilePromptDismissedAt).toBe(1_760_000_000_000)
  })
})
