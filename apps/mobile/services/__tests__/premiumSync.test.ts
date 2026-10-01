/**
 * P3 Full Access: the premium cache belongs to this device and this account.
 * It is never uploaded with the backup, never restored from one (the truth is
 * the store / server entitlement), and an account switch resets it.
 * Real SQLite (CREATE_SQL + MIGRATIONS) + a fake backend.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { pullUserData, pushUserData, reconcileAccountOwner, _resetPushSchedulerForTests } from '../sync'
import { _clearForTests } from '../queryCache'

const mockState: { remote: Record<string, unknown> | null; user: { id: string } | null } = { remote: null, user: { id: 'u1' } }

jest.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: jest.fn(async () => ({ data: { user: mockState.user } })) },
    from: jest.fn(() => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            single: async () => (mockState.remote
              ? { data: mockState.remote, error: null }
              : { data: null, error: { code: 'PGRST116', message: 'no rows' } }),
          }),
        }),
      }),
      upsert: async (row: Record<string, unknown>) => { mockState.remote = row; return { error: null } },
    })),
  },
}))
jest.mock('../notifications', () => ({ cancelNoteReminder: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../lib/analytics', () => ({ resetAnalytics: jest.fn() }))
const mockForget = jest.fn()
jest.mock('../premiumState', () => ({ forgetPremiumState: () => mockForget() }))
jest.mock('../questionReports', () => ({ pushPendingReports: jest.fn().mockResolvedValue(undefined) }))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return { raw, db: drizzle(raw, { schema }) as unknown as DrizzleClient }
}
type Raw = InstanceType<typeof Database>
const row = (raw: Raw) => raw.prepare('SELECT * FROM user_settings WHERE id=1').get() as Record<string, unknown>

function synced(raw: Raw, cols: Record<string, unknown> = {}) {
  const all = { id: 1, owner_user_id: 'u1', last_pull_ok_at: 1, full_name: 'Juan', ...cols }
  const names = Object.keys(all)
  raw.prepare(`INSERT OR REPLACE INTO user_settings (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`)
    .run(...Object.values(all))
}

beforeEach(() => {
  Object.assign(mockState, { remote: null, user: { id: 'u1' } })
  _resetPushSchedulerForTests()
  _clearForTests()
})

it('never uploads the premium cache with the settings backup', async () => {
  const { raw, db } = makeDb()
  synced(raw, { premium_cached: 1, premium_checked_at: 500 })
  expect(await pushUserData(db)).toBe(true)
  const settings = (mockState.remote as { settings: Record<string, unknown> }).settings
  expect(settings.fullName).toBe('Juan')
  expect(settings).not.toHaveProperty('premiumCached')
  expect(settings).not.toHaveProperty('premiumCheckedAt')
})

it('never restores premium from a backup', async () => {
  const { raw, db } = makeDb()
  synced(raw)
  mockState.remote = { user_id: 'u1', settings: { fullName: 'Juan', premiumCached: true, premiumCheckedAt: 9 } }
  await pullUserData(db)
  expect(row(raw)).toMatchObject({ premium_cached: 0, premium_checked_at: 0 })
})

it('a different account signing in starts free on this device', async () => {
  const { raw, db } = makeDb()
  synced(raw, { premium_cached: 1, premium_checked_at: 500 })
  expect(await reconcileAccountOwner(db, 'u2')).toBe('switched')
  expect(row(raw)).toMatchObject({ owner_user_id: 'u2', premium_cached: 0, premium_checked_at: 0 })
  expect(mockForget).toHaveBeenCalledTimes(1)
})

it('the same account signing in again keeps its access', async () => {
  const { raw, db } = makeDb()
  synced(raw, { premium_cached: 1, premium_checked_at: 500 })
  mockForget.mockClear()
  expect(await reconcileAccountOwner(db, 'u1')).toBe('same')
  expect(row(raw)).toMatchObject({ premium_cached: 1 })
  expect(mockForget).not.toHaveBeenCalled()
})
