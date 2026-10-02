/**
 * The web glimpse (P4): a guest's diagnostic follows them into the account they
 * create. Real SQLite (CREATE_SQL + MIGRATIONS) + a fake backend, like
 * syncDataLoss.test.ts. The guest device has the bare settings row only (no
 * owner, no name, no consent), so the first sign-in claims it and MERGES the
 * guest's sessions and attempts with the account's backup (never replaces, never
 * wipes), then backs up the union. Onboarding (consent first) still runs: the
 * merge writes no name and no consent.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pullUserData, reconcileAccountOwner, _resetPushSchedulerForTests } from '../sync'
import { ensureGuestSettings } from '../guestPreview'
import { _clearForTests } from '../queryCache'

const mockState: { remote: Record<string, unknown> | null; log: string[]; user: { id: string; email?: string } | null } =
  { remote: null, log: [], user: { id: 'new-user', email: 'new@x.ph' } }

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      select: (cols?: string) => ({
        eq: () => ({
          limit: () => ({
            single: async () => {
              mockState.log.push(cols === 'settings' ? 'consent-check' : 'select')
              return mockState.remote
                ? { data: mockState.remote, error: null }
                : { data: null, error: { code: 'PGRST116', message: 'no rows' } }
            },
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        mockState.log.push('upsert')
        mockState.remote = row
        return { error: null }
      },
    })),
  },
}))
jest.mock('../notifications', () => ({ cancelNoteReminder: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

type Raw = InstanceType<typeof Database>
function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
const count = (raw: Raw, t: string) => (raw.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c
const settings = (raw: Raw) => raw.prepare('SELECT owner_user_id, full_name, consented_at, consent_version, onboarding_step FROM user_settings WHERE id=1').get() as Record<string, unknown>

/** What the guest diagnostic leaves behind: one session per subject + attempts. */
async function guestDevice() {
  const { raw, db } = makeDb()
  await ensureGuestSettings(db)
  raw.exec(`INSERT INTO practice_sessions (listing_slug, topic_id, deck_id, score, total, duration_secs, completed_at, subtest, kind, attempt_key)
            VALUES ('upcat', '', '', 3, 5, 300, 2000, 'Science', 'diagnostic', 1500),
                   ('upcat', '', '', 4, 5, 300, 2000, 'Mathematics', 'diagnostic', 1500)`)
  raw.exec(`INSERT INTO question_attempts (session_key, source_table, question_id, listing_slug, subtest, selected_index, correct_index, correct, elapsed_ms, answered_at)
            VALUES (1500, 'upcat_questions', 'S1', 'upcat', 'Science', 0, 0, 1, 4000, 1600),
                   (1500, 'upcat_questions', 'M1', 'upcat', 'Mathematics', 1, 2, 0, 5000, 1700)`)
  return { raw, db }
}

beforeEach(() => {
  Object.assign(mockState, { remote: null, log: [], user: { id: 'new-user', email: 'new@x.ph' } })
  _resetPushSchedulerForTests()
  _clearForTests()
})

describe('guest -> sign-up keeps the guest diagnostic', () => {
  it('the guest row is an unowned, unnamed, unconsented device', async () => {
    const { raw } = await guestDevice()
    expect(settings(raw)).toEqual({ owner_user_id: '', full_name: '', consented_at: 0, consent_version: '', onboarding_step: '' })
  })

  it('a new account (no backup) claims the device, keeps the sessions and attempts, and backs them up', async () => {
    const { raw, db } = await guestDevice()
    expect(await reconcileAccountOwner(db, 'new-user', 'new@x.ph')).toBe('claimed')
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(2)
    expect(count(raw, 'question_attempts')).toBe(2)
    expect(settings(raw)).toMatchObject({ owner_user_id: 'new-user', full_name: '', consented_at: 0 })
    // Backed up as the new account's (the push that follows a first sign-in, or the next one).
    const { pushUserData } = require('../sync') as typeof import('../sync')
    await pushUserData(db)
    expect(mockState.log).toContain('upsert')
    expect((mockState.remote!.practice_sessions as unknown[]).length).toBe(2)
    expect((mockState.remote!.question_attempts as unknown[]).length).toBe(2)
  })

  it('an existing account with its own backup gets the union (merge rules), never a replace', async () => {
    const { raw, db } = await guestDevice()
    mockState.user = { id: 'old-user', email: 'old@x.ph' }
    mockState.remote = {
      settings: { fullName: 'Ana', targetExams: '["upcat"]', ageBand: 'adult', consentVersion: '2026-10-01', consentedAt: 5 },
      practice_sessions: [{ id: 7, listingSlug: 'upcat', topicId: '', deckId: '', score: 9, total: 10, durationSecs: 60, completedAt: 900, subtest: 'English', kind: 'mock', attemptKey: 800 }],
      question_attempts: [{ id: 3, sessionKey: 800, sourceTable: 'upcat_questions', questionId: 'E1', listingSlug: 'upcat', subtest: 'English', topic: null, selectedIndex: 0, correctIndex: 0, correct: true, elapsedMs: 1000, answeredAt: 850 }],
    }
    expect(await reconcileAccountOwner(db, 'old-user', 'old@x.ph')).toBe('claimed')
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(3)
    expect(count(raw, 'question_attempts')).toBe(3)
    // The account's own profile and consent come back with its backup.
    expect(settings(raw)).toMatchObject({ owner_user_id: 'old-user', full_name: 'Ana', consented_at: 5 })
    expect(mockState.log).toContain('upsert')
    expect((mockState.remote!.practice_sessions as unknown[]).length).toBe(3)
  })
})

// Security review (RA 10173). On web the guest's run is merged only when THIS
// tab just ran the preview (a fresh sessionStorage marker). A run left on a
// shared browser by an earlier visitor is never merged into whoever signs in
// next: the device is reset as for an account switch.
describe('web: the guest run merges only from the tab that just ran the preview', () => {
  const RN = require('react-native') as { Platform: { OS: string } }
  const g = globalThis as { sessionStorage?: unknown }
  function storage(v: string | null) {
    return { getItem: () => v, setItem: () => undefined, removeItem: () => undefined }
  }
  beforeEach(() => { RN.Platform.OS = 'web' })
  afterEach(() => { RN.Platform.OS = 'ios'; delete g.sessionStorage })

  it('fresh marker (same tab): claimed and merged, as on native', async () => {
    g.sessionStorage = storage(String(Date.now() - 60_000))
    const { raw, db } = await guestDevice()
    expect(await reconcileAccountOwner(db, 'new-user', 'new@x.ph')).toBe('claimed')
    expect(count(raw, 'practice_sessions')).toBe(2)
  })

  it.each([
    ['no marker (another tab, days later)', () => storage(null)],
    ['a stale marker (over 6 hours old)', () => storage(String(Date.now() - 7 * 60 * 60 * 1000))],
    ['sessionStorage that throws', () => ({ getItem: () => { throw new Error('blocked') } })],
    ['no sessionStorage at all', () => undefined],
  ])('%s: switched, the earlier visitor\'s run is wiped, never merged', async (_n, make) => {
    const s = make()
    if (s === undefined) delete g.sessionStorage
    else g.sessionStorage = s
    const { raw, db } = await guestDevice()
    expect(await reconcileAccountOwner(db, 'new-user', 'new@x.ph')).toBe('switched')
    expect(count(raw, 'practice_sessions')).toBe(0)
    expect(count(raw, 'question_attempts')).toBe(0)
    expect(settings(raw)).toMatchObject({ owner_user_id: 'new-user' })
    await pullUserData(db)
    expect(count(raw, 'practice_sessions')).toBe(0)
  })

  it('a legacy install whose stored auth id is this user is still claimed (it is theirs)', async () => {
    g.sessionStorage = storage(null)
    const { raw, db } = await guestDevice()
    raw.exec("UPDATE user_settings SET google_id = 'new-user' WHERE id = 1")
    expect(await reconcileAccountOwner(db, 'new-user', 'new@x.ph')).toBe('claimed')
    expect(count(raw, 'practice_sessions')).toBe(2)
  })
})

// Security review: a push queued during the guest run can fire after sign-in but
// before the pull's reconcile. It must not claim the device and overwrite an
// existing account's backup with guest-only data.
describe('a push never claims an owner-less device that has never pulled', () => {
  it('returns false, uploads nothing, leaves the device unowned', async () => {
    const { raw, db } = await guestDevice()
    mockState.user = { id: 'old-user', email: 'old@x.ph' }
    mockState.remote = { settings: { fullName: 'Ana' }, practice_sessions: [{ id: 7 }] }
    const { pushUserData } = require('../sync') as typeof import('../sync')
    expect(await pushUserData(db)).toBe(false)
    expect(mockState.log).not.toContain('upsert')
    expect(mockState.remote).toMatchObject({ settings: { fullName: 'Ana' } })
    expect(settings(raw)).toMatchObject({ owner_user_id: '' })
  })
})
