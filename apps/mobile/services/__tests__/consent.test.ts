/**
 * P1b consent service: real SQLite (CREATE_SQL + MIGRATIONS). Recording consent,
 * the separate sensitive-data opt-in, withdrawal that clears the details and
 * schedules a backup push, and the analytics choice.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { getSettings, updateSettings } from '../settings'
import {
  recordConsent, grantSensitiveConsent, withdrawSensitiveConsent, setAnalyticsOptIn,
} from '../consent'
import { CONSENT_VERSION } from '../../utils/consent'

const mockSchedule = jest.fn()
jest.mock('../pushScheduler', () => ({ schedulePushUserData: (...a: unknown[]) => mockSchedule(...a) }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

beforeEach(() => mockSchedule.mockClear())

describe('recordConsent', () => {
  it('stores an adult with the current version and no guardian time', async () => {
    const db = makeDb()
    await recordConsent(db, { ageBand: 'adult', now: 1000 })
    expect(await getSettings(db)).toMatchObject({
      ageBand: 'adult', consentVersion: CONSENT_VERSION, consentedAt: 1000, guardianConsentAt: 0,
    })
  })

  it('stores a minor with the guardian attestation time', async () => {
    const db = makeDb()
    await recordConsent(db, { ageBand: 'minor', now: 2000 })
    expect(await getSettings(db)).toMatchObject({
      ageBand: 'minor', consentVersion: CONSENT_VERSION, consentedAt: 2000, guardianConsentAt: 2000,
    })
  })

  it('a re-consent after an update refreshes the version and times, not the other settings', async () => {
    const db = makeDb()
    await updateSettings(db, { fullName: 'Juan', consentVersion: '2025-01-01', ageBand: 'adult', consentedAt: 5 })
    await recordConsent(db, { ageBand: 'adult', now: 9000 })
    expect(await getSettings(db)).toMatchObject({ fullName: 'Juan', consentVersion: CONSENT_VERSION, consentedAt: 9000 })
  })

  it('schedules a backup push so the consent record reaches the cloud', async () => {
    const db = makeDb()
    await recordConsent(db, { ageBand: 'adult', now: 1 })
    expect(mockSchedule).toHaveBeenCalled()
  })
})

describe('sensitive consent', () => {
  it('grant stamps the time', async () => {
    const db = makeDb()
    await grantSensitiveConsent(db, 4000)
    expect((await getSettings(db)).sensitiveConsentAt).toBe(4000)
  })

  it('withdraw clears income, GWA, Grade 8-11 grades and Indigenous status, resets consent, keeps the rest, and schedules a backup push', async () => {
    const db = makeDb()
    await updateSettings(db, {
      fullName: 'Juan', province: 'Cebu', schoolType: 'private', targetCampus: 'UP Cebu', gradeLevel: 11,
      incomeBracket: '100k-300k', gwa: 91, hsGwaG8: 88, hsGwaG9: 89, hsGwaG10: 90, hsGwaG11: 92,
      isIndigenous: true, sensitiveConsentAt: 77,
    })
    mockSchedule.mockClear()
    await withdrawSensitiveConsent(db, 5000)
    const s = await getSettings(db)
    expect(s).toMatchObject({
      incomeBracket: null, gwa: null, hsGwaG8: null, hsGwaG9: null, hsGwaG10: null, hsGwaG11: null,
      isIndigenous: false, sensitiveConsentAt: 0, sensitiveWithdrawnAt: 5000,
      fullName: 'Juan', province: 'Cebu', schoolType: 'private', targetCampus: 'UP Cebu', gradeLevel: 11,
    })
    expect(mockSchedule).toHaveBeenCalledWith(db)
  })
})

describe('setAnalyticsOptIn', () => {
  it('stamps when the choice was made, so the latest choice wins across devices', async () => {
    const db = makeDb()
    await setAnalyticsOptIn(db, false, 6000)
    expect(await getSettings(db)).toMatchObject({ analyticsOptIn: 0, analyticsChoiceAt: 6000 })
  })

  it('stores 1 and 0, never null', async () => {
    const db = makeDb()
    await setAnalyticsOptIn(db, true)
    expect((await getSettings(db)).analyticsOptIn).toBe(1)
    await setAnalyticsOptIn(db, false)
    expect((await getSettings(db)).analyticsOptIn).toBe(0)
  })
})
