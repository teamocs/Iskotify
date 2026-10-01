/**
 * applyAnalyticsConsent: reads the stored consent and switches analytics on or
 * off. Fails closed: if the settings cannot be read, analytics stays off.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import { applyAnalyticsConsent, identifyAfterConsent } from '../analyticsConsent'

const mockSet = jest.fn()
const mockOrder: string[] = []
jest.mock('../../lib/analytics', () => ({
  setAnalyticsConsent: (v: boolean) => { mockOrder.push(`consent:${v}`); mockSet(v) },
  identifyUser: (id: string) => { mockOrder.push(`identify:${id}`) },
}))
jest.mock('../pushScheduler', () => ({ schedulePushUserData: jest.fn() }))

function makeDb(row?: Record<string, unknown>) {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  if (row) {
    const names = Object.keys({ id: 1, ...row })
    raw.prepare(`INSERT INTO user_settings (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...Object.values({ id: 1, ...row }))
  }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

beforeEach(() => { mockSet.mockClear(); mockOrder.length = 0 })

describe('applyAnalyticsConsent', () => {
  it('stays off on a fresh install (no consent yet)', async () => {
    expect(await applyAnalyticsConsent(makeDb())).toBe(false)
    expect(mockSet).toHaveBeenCalledWith(false)
  })

  it('an adult who consented defaults to on', async () => {
    expect(await applyAnalyticsConsent(makeDb({ age_band: 'adult', consented_at: 5 }))).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(true)
  })

  it('a minor who consented defaults to off', async () => {
    expect(await applyAnalyticsConsent(makeDb({ age_band: 'minor', consented_at: 5, guardian_consent_at: 5 }))).toBe(false)
  })

  it('a minor who opted in is on; an adult who opted out is off', async () => {
    expect(await applyAnalyticsConsent(makeDb({ age_band: 'minor', consented_at: 5, analytics_opt_in: 1 }))).toBe(true)
    expect(await applyAnalyticsConsent(makeDb({ age_band: 'adult', consented_at: 5, analytics_opt_in: 0 }))).toBe(false)
  })

  it('fails closed when the settings cannot be read', async () => {
    const broken = { select: () => { throw new Error('db down') } } as unknown as DrizzleClient
    expect(await applyAnalyticsConsent(broken)).toBe(false)
    expect(mockSet).toHaveBeenCalledWith(false)
  })
})

describe('identifyAfterConsent', () => {
  it("applies THIS device's stored consent before the account id is handed over, so it is only held without consent", async () => {
    await identifyAfterConsent(makeDb(), 'user-b')
    expect(mockOrder).toEqual(['consent:false', 'identify:user-b'])
  })

  it('a consented adult is identified with analytics already on', async () => {
    await identifyAfterConsent(makeDb({ age_band: 'adult', consented_at: 5 }), 'user-a')
    expect(mockOrder).toEqual(['consent:true', 'identify:user-a'])
  })
})
