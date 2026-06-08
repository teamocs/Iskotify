import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { getSettings, updateSettings } from '../settings'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY NOT NULL,
      selected_listing_slug TEXT NOT NULL DEFAULT '',
      last_synced_at INTEGER NOT NULL DEFAULT 0,
      full_name TEXT NOT NULL DEFAULT '',
      school TEXT NOT NULL DEFAULT '',
      grade_level INTEGER,
      google_id TEXT,
      email TEXT,
      notifications_enabled INTEGER DEFAULT 1,
      theme TEXT NOT NULL DEFAULT 'system',
      focus_mode_enabled INTEGER NOT NULL DEFAULT 1,
      google_calendar_connected INTEGER NOT NULL DEFAULT 0,
      income_bracket TEXT,
      gwa REAL,
      province TEXT,
      city TEXT,
      hs_gwa_g8 REAL,
      hs_gwa_g9 REAL,
      hs_gwa_g10 REAL,
      hs_gwa_g11 REAL,
      school_type TEXT,
      is_indigenous INTEGER,
      target_campus TEXT,
      score_disclaimer_ack INTEGER NOT NULL DEFAULT 0,
      target_exams TEXT NOT NULL DEFAULT '[]',
      target_courses TEXT NOT NULL DEFAULT '[]',
      school_region TEXT NOT NULL DEFAULT ''
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('getSettings', () => {
  it('returns defaults when no row exists', async () => {
    const db = makeDb()
    const s = await getSettings(db)
    expect(s.fullName).toBe('')
    expect(s.gradeLevel).toBeNull()
    expect(s.incomeBracket).toBeNull()
    expect(s.gwa).toBeNull()
    expect(s.province).toBeNull()
    expect(s.city).toBeNull()
  })

  it('reads existing row including Epic B fields', async () => {
    const db = makeDb()
    await db.insert(schema.userSettings).values({
      id: 1,
      fullName: 'Juan',
      school: 'PSHS',
      gradeLevel: 12,
      incomeBracket: '<=100k',
      gwa: 92.5,
      province: 'Cebu',
      city: 'Cebu City',
    })
    const s = await getSettings(db)
    expect(s.fullName).toBe('Juan')
    expect(s.school).toBe('PSHS')
    expect(s.gradeLevel).toBe(12)
    expect(s.incomeBracket).toBe('<=100k')
    expect(s.gwa).toBe(92.5)
    expect(s.province).toBe('Cebu')
    expect(s.city).toBe('Cebu City')
  })
})

describe('updateSettings', () => {
  it('upserts a new row with partial fields', async () => {
    const db = makeDb()
    await updateSettings(db, { fullName: 'Maria', gradeLevel: 11 })
    const s = await getSettings(db)
    expect(s.fullName).toBe('Maria')
    expect(s.gradeLevel).toBe(11)
  })

  it('round-trips income_bracket field', async () => {
    const db = makeDb()
    await updateSettings(db, { incomeBracket: '100k-300k' })
    const s = await getSettings(db)
    expect(s.incomeBracket).toBe('100k-300k')
  })

  it('round-trips gwa field as a float', async () => {
    const db = makeDb()
    await updateSettings(db, { gwa: 88.75 })
    const s = await getSettings(db)
    expect(s.gwa).toBe(88.75)
  })

  it('round-trips province field', async () => {
    const db = makeDb()
    await updateSettings(db, { province: 'Laguna' })
    const s = await getSettings(db)
    expect(s.province).toBe('Laguna')
  })

  it('round-trips city field', async () => {
    const db = makeDb()
    await updateSettings(db, { city: 'Calamba' })
    const s = await getSettings(db)
    expect(s.city).toBe('Calamba')
  })

  it('round-trips all four Epic B fields in one call', async () => {
    const db = makeDb()
    await updateSettings(db, {
      incomeBracket: '300k-600k',
      gwa: 95.0,
      province: 'Metro Manila',
      city: 'Quezon City',
    })
    const s = await getSettings(db)
    expect(s.incomeBracket).toBe('300k-600k')
    expect(s.gwa).toBe(95.0)
    expect(s.province).toBe('Metro Manila')
    expect(s.city).toBe('Quezon City')
  })

  it('clears Epic B fields when set to null', async () => {
    const db = makeDb()
    await updateSettings(db, {
      incomeBracket: '<=100k',
      gwa: 91.0,
      province: 'Cebu',
      city: 'Cebu City',
    })
    await updateSettings(db, {
      incomeBracket: null,
      gwa: null,
      province: null,
      city: null,
    })
    const s = await getSettings(db)
    expect(s.incomeBracket).toBeNull()
    expect(s.gwa).toBeNull()
    expect(s.province).toBeNull()
    expect(s.city).toBeNull()
  })

  it('updates only the patched fields and leaves others intact', async () => {
    const db = makeDb()
    await updateSettings(db, { fullName: 'Pedro', school: 'UP', gradeLevel: 12, province: 'Rizal' })
    await updateSettings(db, { incomeBracket: '>1.2M' })
    const s = await getSettings(db)
    expect(s.fullName).toBe('Pedro')
    expect(s.school).toBe('UP')
    expect(s.gradeLevel).toBe(12)
    expect(s.province).toBe('Rizal')
    expect(s.incomeBracket).toBe('>1.2M')
  })

  it('round-trips all Epic E estimator fields in one call', async () => {
    const db = makeDb()
    await updateSettings(db, {
      hsGwaG8: 91.5,
      hsGwaG9: 92.0,
      hsGwaG10: 93.5,
      hsGwaG11: 94.0,
      schoolType: 'public',
      isIndigenous: false,
      targetCampus: 'UP Diliman',
      scoreDisclaimerAck: true,
    })
    const s = await getSettings(db)
    expect(s.hsGwaG8).toBe(91.5)
    expect(s.hsGwaG9).toBe(92.0)
    expect(s.hsGwaG10).toBe(93.5)
    expect(s.hsGwaG11).toBe(94.0)
    expect(s.schoolType).toBe('public')
    expect(s.isIndigenous).toBe(false)
    expect(s.targetCampus).toBe('UP Diliman')
    expect(s.scoreDisclaimerAck).toBe(true)
  })

  it('clears Epic E fields when set to null', async () => {
    const db = makeDb()
    await updateSettings(db, { hsGwaG8: 90.0, schoolType: 'private', targetCampus: 'UP Manila' })
    await updateSettings(db, { hsGwaG8: null, schoolType: null, targetCampus: null })
    const s = await getSettings(db)
    expect(s.hsGwaG8).toBeNull()
    expect(s.schoolType).toBeNull()
    expect(s.targetCampus).toBeNull()
  })
})
