/**
 * P1b: consent travels with the account. Real SQLite (CREATE_SQL + MIGRATIONS)
 * + a fake backend. Push carries the consent columns; pull restores them without
 * ever blanking a consent this device already has; a withdrawal made elsewhere
 * clears the sensitive details here too; an account switch forgets the previous
 * person's consent.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pullUserData, pushUserData, reconcileAccountOwner, _resetPushSchedulerForTests } from '../sync'
import { _clearForTests } from '../queryCache'

const mockState: {
  remote: Record<string, unknown> | null; user: { id: string } | null; selectError: unknown; upserts: number
} = { remote: null, user: { id: 'u1' }, selectError: null, upserts: 0 }

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            single: async () => (mockState.selectError
              ? { data: null, error: mockState.selectError }
              : mockState.remote
              ? { data: mockState.remote, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'no rows' } }),
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => { mockState.upserts++; mockState.remote = row; return { error: null } },
    })),
  },
}))
jest.mock('../notifications', () => ({ cancelNoteReminder: jest.fn().mockResolvedValue(undefined) }))
const mockResetAnalytics = jest.fn()
jest.mock('../../lib/analytics', () => ({ resetAnalytics: () => mockResetAnalytics() }))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
type Raw = InstanceType<typeof Database>
const row = (raw: Raw) => raw.prepare('SELECT * FROM user_settings WHERE id=1').get() as Record<string, unknown>

/** A device that already pulled for u1 (steady state: the backup replaces local). */
function synced(raw: Raw, cols: Record<string, unknown> = {}) {
  const all = { id: 1, owner_user_id: 'u1', last_pull_ok_at: 1, full_name: 'Juan', ...cols }
  const names = Object.keys(all)
  raw.prepare(`INSERT OR REPLACE INTO user_settings (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...Object.values(all))
}

const CONSENT = {
  ageBand: 'adult', consentVersion: '2026-10-01', consentedAt: 100, guardianConsentAt: 0,
  sensitiveConsentAt: 0, sensitiveWithdrawnAt: 0, analyticsOptIn: null, analyticsChoiceAt: 0,
}
const GRADES = { gwa: 90, income_bracket: '<=100k', hs_gwa_g9: 89, is_indigenous: 1 }
const CLEARED_ROW = { sensitive_consent_at: 0, gwa: null, income_bracket: null, hs_gwa_g9: null, is_indigenous: 0 }

beforeEach(() => {
  Object.assign(mockState, { remote: null, user: { id: 'u1' }, selectError: null, upserts: 0 })
  _resetPushSchedulerForTests()
  _clearForTests()
  mockResetAnalytics.mockClear()
})

describe('push', () => {
  it('uploads the consent columns inside the settings backup', async () => {
    const { raw, db } = makeDb()
    synced(raw, {
      age_band: 'minor', consent_version: '2026-10-01', consented_at: 5, guardian_consent_at: 6,
      sensitive_consent_at: 7, analytics_opt_in: 0, sensitive_withdrawn_at: 3, analytics_choice_at: 4,
    })
    expect(await pushUserData(db)).toBe(true)
    expect(mockState.remote!.settings).toMatchObject({
      ageBand: 'minor', consentVersion: '2026-10-01', consentedAt: 5, guardianConsentAt: 6,
      sensitiveConsentAt: 7, analyticsOptIn: 0, sensitiveWithdrawnAt: 3, analyticsChoiceAt: 4,
    })
  })

  it('a withdrawal reaches the cloud copy: the pushed settings no longer hold the sensitive details', async () => {
    const { raw, db } = makeDb()
    synced(raw, { gwa: 91, income_bracket: '100k-300k', hs_gwa_g8: 88, is_indigenous: 1, sensitive_consent_at: 9 })
    await pushUserData(db)
    expect(mockState.remote!.settings).toMatchObject({ gwa: 91, incomeBracket: '100k-300k' })
    // What withdrawSensitiveConsent writes: details cleared, withdrawal stamped.
    raw.exec('UPDATE user_settings SET gwa=NULL, income_bracket=NULL, hs_gwa_g8=NULL, is_indigenous=0, sensitive_consent_at=0, sensitive_withdrawn_at=10')
    await pushUserData(db)
    expect(mockState.remote!.settings).toMatchObject({
      gwa: null, incomeBracket: null, hsGwaG8: null, isIndigenous: false, sensitiveConsentAt: 0,
    })
  })
})

describe('push never carries sensitive details without consent', () => {
  it('details stored before consent existed (legacy rows) are uploaded cleared', async () => {
    const { raw, db } = makeDb()
    synced(raw, { ...GRADES, hs_gwa_g8: 88, sensitive_consent_at: 0 })
    expect(await pushUserData(db)).toBe(true)
    expect(mockState.remote!.settings).toMatchObject({
      gwa: null, incomeBracket: null, hsGwaG8: null, hsGwaG9: null, isIndigenous: false, sensitiveConsentAt: 0,
    })
    // The device itself is not rewritten by a push; the features already read them as "not provided".
    expect(row(raw).gwa).toBe(90)
  })

  it('a device that still holds consent applies a newer withdrawal from the backup before uploading', async () => {
    const { raw, db } = makeDb()
    synced(raw, { ...GRADES, age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 50 })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveWithdrawnAt: 60 } }
    expect(await pushUserData(db)).toBe(true)
    expect(row(raw)).toMatchObject({ ...CLEARED_ROW, sensitive_withdrawn_at: 60 })
    expect(mockState.remote!.settings).toMatchObject({ gwa: null, incomeBracket: null, sensitiveConsentAt: 0, sensitiveWithdrawnAt: 60 })
  })

  it('a consent given again after that withdrawal is kept and uploaded', async () => {
    const { raw, db } = makeDb()
    synced(raw, { ...GRADES, age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 70, sensitive_withdrawn_at: 60 })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveWithdrawnAt: 60 } }
    expect(await pushUserData(db)).toBe(true)
    expect(mockState.remote!.settings).toMatchObject({ gwa: 90, sensitiveConsentAt: 70, sensitiveWithdrawnAt: 60 })
  })

  it('never erases the backup withdrawal or a newer analytics choice made elsewhere', async () => {
    const { raw, db } = makeDb()
    synced(raw, { age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, analytics_opt_in: 1, analytics_choice_at: 100 })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveWithdrawnAt: 60, analyticsOptIn: 0, analyticsChoiceAt: 200 } }
    expect(await pushUserData(db)).toBe(true)
    expect(row(raw)).toMatchObject({ analytics_opt_in: 0, analytics_choice_at: 200, sensitive_withdrawn_at: 60 })
    expect(mockState.remote!.settings).toMatchObject({ analyticsOptIn: 0, analyticsChoiceAt: 200, sensitiveWithdrawnAt: 60 })
  })

  it('does not upload when the backup cannot be checked (it could hold a withdrawal)', async () => {
    const { raw, db } = makeDb()
    synced(raw, { ...GRADES, sensitive_consent_at: 50 })
    mockState.selectError = { code: '08006', message: 'offline' }
    expect(await pushUserData(db)).toBe(false)
    expect(mockState.upserts).toBe(0)
  })
})

describe('pull (restore)', () => {
  it('a new device adopts the consent recorded in the backup', async () => {
    const { raw, db } = makeDb()
    synced(raw)
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, ageBand: 'minor', guardianConsentAt: 101, analyticsOptIn: 1 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({
      age_band: 'minor', consent_version: '2026-10-01', consented_at: 100, guardian_consent_at: 101, analytics_opt_in: 1,
    })
  })

  it('a backup that predates consent never blanks the consent on this device', async () => {
    const { raw, db } = makeDb()
    synced(raw, {
      age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 50, analytics_opt_in: 0,
    })
    mockState.remote = { settings: { fullName: 'Juan' } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({
      age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 50, analytics_opt_in: 0,
    })
  })

  it('a withdrawal made on another device clears the sensitive details here too', async () => {
    const { raw, db } = makeDb()
    synced(raw, {
      age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 50,
      gwa: 90, income_bracket: '<=100k', hs_gwa_g9: 89, is_indigenous: 1,
    })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveWithdrawnAt: 60 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({ ...CLEARED_ROW, sensitive_withdrawn_at: 60 })
  })

  it('a stale backup that still holds the grant never brings back consent withdrawn here', async () => {
    const { raw, db } = makeDb()
    synced(raw, {
      age_band: 'adult', consent_version: '2026-10-01', consented_at: 100, sensitive_consent_at: 0, sensitive_withdrawn_at: 60,
    })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveConsentAt: 50, gwa: 90 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({ sensitive_consent_at: 0, sensitive_withdrawn_at: 60, gwa: null })
  })

  it('a newer Terms version on this device does not override a later withdrawal from the backup', async () => {
    const { raw, db } = makeDb()
    synced(raw, { ...GRADES, age_band: 'adult', consent_version: '2027-01-01', consented_at: 100, sensitive_consent_at: 50 })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveWithdrawnAt: 60 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({ consent_version: '2027-01-01', ...CLEARED_ROW })
  })

  it('on the first sign-in merge, a minor on either side stays a minor and an explicit analytics "off" wins', async () => {
    const { raw, db } = makeDb()
    raw.prepare(`INSERT OR REPLACE INTO user_settings
      (id, full_name, age_band, consent_version, consented_at, guardian_consent_at, analytics_opt_in, analytics_choice_at)
      VALUES (1, 'Juan', 'minor', '2026-10-01', 100, 101, 0, 10)`).run()
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, consentedAt: 300, analyticsOptIn: 1, analyticsChoiceAt: 99 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({ age_band: 'minor', guardian_consent_at: 101, analytics_opt_in: 0 })
  })

  it('an opt-in made on another device is adopted', async () => {
    const { raw, db } = makeDb()
    synced(raw, { age_band: 'adult', consent_version: '2026-10-01', consented_at: 100 })
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveConsentAt: 222 } }
    await pullUserData(db)
    expect(row(raw).sensitive_consent_at).toBe(222)
  })

  it('on the first sign-in merge, keeps a sensitive consent given on this device', async () => {
    const { raw, db } = makeDb()
    // Never pulled for this owner (last_pull_ok_at = 0): merging, not replacing.
    raw.prepare(`INSERT OR REPLACE INTO user_settings
      (id, full_name, age_band, consent_version, consented_at, sensitive_consent_at, gwa)
      VALUES (1, 'Juan', 'adult', '2026-10-01', 100, 50, 90)`).run()
    mockState.remote = { settings: { fullName: 'Juan', ...CONSENT, sensitiveConsentAt: 0 } }
    await pullUserData(db)
    expect(row(raw)).toMatchObject({ sensitive_consent_at: 50, gwa: 90 })
  })
})

describe('account switch', () => {
  it('switches analytics off when a different account takes over the device, not for the same account', async () => {
    const { raw, db } = makeDb()
    synced(raw, { age_band: 'adult', consent_version: '2026-10-01', consented_at: 100 })
    expect(await reconcileAccountOwner(db, 'u1')).toBe('same')
    expect(mockResetAnalytics).not.toHaveBeenCalled()
    expect(await reconcileAccountOwner(db, 'u2')).toBe('switched')
    expect(mockResetAnalytics).toHaveBeenCalledTimes(1)
  })

  it("forgets the previous person's consent so the next account is asked", async () => {
    const { raw, db } = makeDb()
    synced(raw, {
      age_band: 'minor', consent_version: '2026-10-01', consented_at: 100, guardian_consent_at: 101,
      sensitive_consent_at: 102, analytics_opt_in: 1, sensitive_withdrawn_at: 99, analytics_choice_at: 98,
    })
    expect(await reconcileAccountOwner(db, 'u2')).toBe('switched')
    expect(row(raw)).toMatchObject({
      age_band: '', consent_version: '', consented_at: 0, guardian_consent_at: 0, sensitive_consent_at: 0, analytics_opt_in: null,
      sensitive_withdrawn_at: 0, analytics_choice_at: 0,
    })
  })
})
