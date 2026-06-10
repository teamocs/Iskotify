import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { userSettings } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Build the user_settings table EXACTLY the way the device does: the base
// CREATE_SQL (8 columns) followed by the sequential ALTER migrations. This is
// the difference from settings.test.ts (which creates a clean all-columns table)
// and is where a migration-sequence bug would hide.
function makeRealRaw() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { raw.exec(sql) } catch { /* duplicate column on re-run — matches device try/catch */ }
  }
  return raw
}

function makeDb() {
  return drizzle(makeRealRaw(), { schema })
}

describe('onboarding persistence — real CREATE_SQL + MIGRATIONS sequence', () => {
  it('user_settings has the onboarding columns after the migration sequence', () => {
    const raw = makeRealRaw()
    const cols = (raw.prepare(`PRAGMA table_info(user_settings)`).all() as { name: string }[]).map(c => c.name)
    // eslint-disable-next-line no-console
    console.log('user_settings columns:', cols.join(', '))
    expect(cols).toContain('school_region')
    expect(cols).toContain('target_exams')
    expect(cols).toContain('target_courses')
  })

  it('handleConfirmStep2 write persists name/grade/school/targetExams', async () => {
    const db = makeDb()
    const profileFields = {
      fullName: 'Juan', school: 'PSHS', schoolRegion: 'NCR', gradeLevel: 11, targetExams: '[]',
    }
    await db.insert(userSettings)
      .values({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0, ...profileFields })
      .onConflictDoUpdate({ target: userSettings.id, set: { selectedListingSlug: 'upcat', lastSyncedAt: 0, ...profileFields } })
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    expect(rows[0]?.fullName).toBe('Juan')
    expect(rows[0]?.gradeLevel).toBe(11)
    expect(rows[0]?.school).toBe('PSHS')
    expect(rows[0]?.schoolRegion).toBe('NCR')
  })

  it('handleCoursesContinue targetCourses write persists without wiping the profile', async () => {
    const db = makeDb()
    await db.insert(userSettings)
      .values({ id: 1, fullName: 'Juan', gradeLevel: 11 })
      .onConflictDoUpdate({ target: userSettings.id, set: { fullName: 'Juan', gradeLevel: 11 } })
    const json = JSON.stringify([{ id: 'c1', label: 'BS Nursing', careerCourseId: 'x' }])
    await db.insert(userSettings)
      .values({ id: 1, targetCourses: json })
      .onConflictDoUpdate({ target: userSettings.id, set: { targetCourses: json } })
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    expect(rows[0]?.targetCourses).toBe(json)
    expect(rows[0]?.fullName).toBe('Juan')
  })
})
