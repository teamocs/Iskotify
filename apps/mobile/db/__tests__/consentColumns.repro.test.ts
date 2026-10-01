import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { userSettings } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Drift guard for the P1b consent columns on user_settings. Runs the REAL
// CREATE_SQL + MIGRATIONS twice (they re-run on every launch) so an upgraded
// install gets the columns and the schema agrees with the SQL.
function makeDb(passes = 2) {
  const raw = new Database(':memory:')
  for (let pass = 0; pass < passes; pass++) {
    raw.exec(CREATE_SQL)
    for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup column/table on re-run */ } }
  }
  return { raw, db: drizzle(raw, { schema }) }
}

type Col = { name: string; type: string; notnull: number; dflt_value: string | null }
const cols = (raw: InstanceType<typeof Database>) =>
  raw.prepare(`PRAGMA table_info(user_settings)`).all() as Col[]

describe('user_settings consent columns — real CREATE_SQL + MIGRATIONS', () => {
  it.each([
    ['age_band', 'TEXT', 1, "''"],
    ['consent_version', 'TEXT', 1, "''"],
    ['consented_at', 'INTEGER', 1, '0'],
    ['guardian_consent_at', 'INTEGER', 1, '0'],
    ['sensitive_consent_at', 'INTEGER', 1, '0'],
    ['analytics_opt_in', 'INTEGER', 0, null],
  ])('%s exists as %s (notnull=%i, default=%s)', (name, type, notnull, dflt) => {
    const { raw } = makeDb()
    expect(cols(raw).find(c => c.name === name)).toMatchObject({ type, notnull, dflt_value: dflt })
  })

  it('an install that predates the columns gets them by migration alone', () => {
    const raw = new Database(':memory:')
    raw.exec(CREATE_SQL)
    // Simulate the old shape: drop nothing, but prove the migrations alone add them on a table created without them.
    raw.exec('DROP TABLE user_settings')
    raw.exec(`CREATE TABLE user_settings (id INTEGER PRIMARY KEY NOT NULL)`)
    for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* other tables / columns */ } }
    const names = cols(raw).map(c => c.name)
    expect(names).toEqual(expect.arrayContaining([
      'age_band', 'consent_version', 'consented_at', 'guardian_consent_at', 'sensitive_consent_at', 'analytics_opt_in',
    ]))
  })

  it('defaults to "no consent" and round-trips through the drizzle schema', async () => {
    const { db } = makeDb()
    await db.insert(userSettings).values({ id: 1 })
    let row = (await db.select().from(userSettings).where(eq(userSettings.id, 1)))[0]!
    expect(row).toMatchObject({
      ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0, sensitiveConsentAt: 0, analyticsOptIn: null,
    })
    await db.update(userSettings).set({
      ageBand: 'minor', consentVersion: '2026-10-01', consentedAt: 111, guardianConsentAt: 222,
      sensitiveConsentAt: 333, analyticsOptIn: 0,
    }).where(eq(userSettings.id, 1))
    row = (await db.select().from(userSettings).where(eq(userSettings.id, 1)))[0]!
    expect(row).toMatchObject({
      ageBand: 'minor', consentVersion: '2026-10-01', consentedAt: 111, guardianConsentAt: 222,
      sensitiveConsentAt: 333, analyticsOptIn: 0,
    })
  })
})
