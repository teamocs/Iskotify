import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../schema'
import { universityProfiles } from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// Reproduces a device that already had `university_profiles` BEFORE
// `requirements`/`qualifications` were added (Task 5, migration 046).
// CREATE_SQL uses `CREATE TABLE IF NOT EXISTS university_profiles (...)`, which
// is a no-op once the table exists — so on such a device the only way the new
// columns get added is the ALTER TABLE migrations below. This test simulates
// that legacy state (pre-046 shape) and then runs the *current* MIGRATIONS
// list against it, asserting both columns exist and default to '[]'.
function makeLegacyRaw() {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE IF NOT EXISTS university_profiles (
      school_id TEXT PRIMARY KEY NOT NULL,
      data_tier TEXT,
      institution_type TEXT,
      year_established TEXT,
      known_for_courses TEXT NOT NULL DEFAULT '[]',
      prc_top_courses TEXT NOT NULL DEFAULT '[]',
      ched_coe_cod TEXT,
      accreditation TEXT,
      entrance_exam_name TEXT,
      entrance_exam_acronym TEXT,
      testing_center_type TEXT,
      application_open TEXT,
      application_close TEXT,
      exam_month TEXT,
      estimated_passing_rate TEXT,
      estimated_slots TEXT,
      tuition_fee_range TEXT,
      free_tuition INTEGER,
      academic_calendar TEXT,
      courses_offered TEXT NOT NULL DEFAULT '[]',
      scholarships_offered TEXT NOT NULL DEFAULT '[]',
      website_url TEXT,
      application_portal_url TEXT,
      facebook_url TEXT,
      exam_difficulty INTEGER,
      notable_programs TEXT NOT NULL DEFAULT '[]',
      prc_strong_boards TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      data_confidence TEXT,
      remote_updated_at INTEGER
    )
  `)
  // Run the *current* CREATE_SQL too (CREATE TABLE IF NOT EXISTS is a no-op
  // against the legacy table above, matching real device behavior) followed
  // by the real MIGRATIONS sequence — same shape as the device boot path.
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { raw.exec(sql) } catch { /* duplicate column on re-run — matches device try/catch */ }
  }
  return raw
}

describe('university_profiles.requirements/qualifications — legacy table + real MIGRATIONS (drift guard)', () => {
  it('adds both columns via ALTER TABLE even when the table pre-dates them', () => {
    const raw = makeLegacyRaw()
    const cols = (raw.prepare(`PRAGMA table_info(university_profiles)`).all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('requirements')
    expect(cols).toContain('qualifications')
  })

  it('defaults both columns to "[]" for a pre-existing row with no explicit value', () => {
    const raw = makeLegacyRaw()
    raw.prepare(`
      INSERT INTO university_profiles (school_id, known_for_courses) VALUES ('school-1', '[]')
    `).run()
    const row = raw.prepare(`SELECT requirements, qualifications FROM university_profiles WHERE school_id = 'school-1'`)
      .get() as { requirements: string; qualifications: string }
    expect(row.requirements).toBe('[]')
    expect(row.qualifications).toBe('[]')
  })

  it('reads/writes requirements/qualifications through drizzle after the migration sequence', async () => {
    const raw = makeLegacyRaw()
    const db = drizzle(raw, { schema })
    await db.insert(universityProfiles).values({
      schoolId: 'school-2',
      requirements: JSON.stringify(['Form 137', 'Barangay Certificate']),
      qualifications: JSON.stringify(['GWA of 85 or higher']),
    }).onConflictDoUpdate({
      target: universityProfiles.schoolId,
      set: { requirements: JSON.stringify(['Form 137', 'Barangay Certificate']) },
    })
    const rows = await db.select().from(universityProfiles).where(eq(universityProfiles.schoolId, 'school-2')).limit(1)
    expect(JSON.parse(rows[0]?.requirements ?? '[]')).toEqual(['Form 137', 'Barangay Certificate'])
    expect(JSON.parse(rows[0]?.qualifications ?? '[]')).toEqual(['GWA of 85 or higher'])
  })
})
