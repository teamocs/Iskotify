/**
 * P3 Full Access: the app-wide premium state. Combines the store (mocked
 * premium adapter), the server entitlement row (mocked) and the offline cache
 * (real SQLite), behind EXPO_PUBLIC_PAYWALL_ENABLED.
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import { CREATE_SQL, MIGRATIONS } from '../../db/client'
import type { DrizzleClient } from '../../db/client'
import {
  initPremium, refreshPremium, signOutPremium, pollPremium, confirmPurchase, getPremiumSnapshot, subscribePremium,
  buyFullAccess, restoreFullAccessForUser, forgetPremiumState, _resetPremiumForTests,
} from '../premiumState'
import { readPremiumCache, writePremiumCache } from '../premiumCache'

const mockAuth: { userId: string | null; listener: ((event: string, session: unknown) => void) | null } = { userId: 'u1', listener: null }
jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockAuth.userId ? { user: { id: mockAuth.userId } } : null } })),
      onAuthStateChange: jest.fn((cb: (event: string, session: unknown) => void) => {
        mockAuth.listener = cb
        return { data: { subscription: { unsubscribe: jest.fn() } } }
      }),
    },
  },
}))

const mockStore = {
  configureStore: jest.fn(),
  storeLogIn: jest.fn(async (_id: string) => true),
  storeLogOut: jest.fn(async () => undefined),
  storeHasPremium: jest.fn(async (): Promise<boolean | null> => null),
  purchaseFullAccess: jest.fn(async (_id: string) => ({ status: 'success' })),
  restoreFullAccess: jest.fn(async (_id: string) => ({ status: 'success' })),
}
jest.mock('../premium', () => ({
  configureStore: () => mockStore.configureStore(),
  storeLogIn: (id: string) => mockStore.storeLogIn(id),
  storeLogOut: () => mockStore.storeLogOut(),
  storeHasPremium: () => mockStore.storeHasPremium(),
  purchaseFullAccess: (id: string) => mockStore.purchaseFullAccess(id),
  restoreFullAccess: (id: string) => mockStore.restoreFullAccess(id),
}))

const mockRow = jest.fn(async (_id: string): Promise<boolean | null> => null)
jest.mock('../entitlements', () => ({ fetchEntitlementPremium: (id: string) => mockRow(id) }))

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
}))

function makeDb() {
  const raw = new Database(':memory:')
  raw.exec(CREATE_SQL)
  for (const sql of MIGRATIONS) { try { raw.exec(sql) } catch { /* dup */ } }
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

beforeEach(() => {
  process.env.EXPO_PUBLIC_PAYWALL_ENABLED = '1'
  mockAuth.userId = 'u1'
  mockAuth.listener = null
  jest.clearAllMocks()
  mockStore.storeHasPremium.mockResolvedValue(null)
  mockRow.mockResolvedValue(null)
  _resetPremiumForTests()
})
afterAll(() => { delete process.env.EXPO_PUBLIC_PAYWALL_ENABLED })

it('with the flag off, reports unlimited access and never touches the store', async () => {
  delete process.env.EXPO_PUBLIC_PAYWALL_ENABLED
  _resetPremiumForTests()
  const db = makeDb()
  await initPremium(db)
  expect(getPremiumSnapshot()).toEqual({ enabled: false, isPremium: false, unlimited: true, loading: false })
  expect(mockStore.configureStore).not.toHaveBeenCalled()
  expect(mockRow).not.toHaveBeenCalled()
})

it('offline, a paying student keeps access from the cache', async () => {
  const db = makeDb()
  await writePremiumCache(db, true, 'u1', 5)
  await initPremium(db)
  expect(getPremiumSnapshot()).toMatchObject({ enabled: true, isPremium: true, unlimited: true, loading: false })
})

it('starts loading, then settles on what the server says, and caches it', async () => {
  const db = makeDb()
  const seen: boolean[] = []
  const unsub = subscribePremium(() => seen.push(getPremiumSnapshot().loading))
  expect(getPremiumSnapshot().loading).toBe(true)
  mockRow.mockResolvedValue(true)
  await initPremium(db)
  unsub()
  expect(getPremiumSnapshot()).toMatchObject({ isPremium: true, loading: false })
  expect(mockStore.storeLogIn).toHaveBeenCalledWith('u1')
  expect(mockRow).toHaveBeenCalledWith('u1')
  expect((await readPremiumCache(db)).premium).toBe(true)
  expect(seen).toContain(false)
})

it('only the server entitlement row grants access, never the store (RevenueCat ids are client-asserted)', async () => {
  const db = makeDb()
  mockStore.storeHasPremium.mockResolvedValue(true)
  mockRow.mockResolvedValue(false)
  await initPremium(db)
  expect(getPremiumSnapshot().isPremium).toBe(false)
  expect(mockStore.storeHasPremium).not.toHaveBeenCalled()
})

it('logs RevenueCat in with the signed-in Supabase user id', async () => {
  const db = makeDb()
  mockAuth.userId = 'supabase-uid-7'
  await initPremium(db)
  expect(mockStore.storeLogIn).toHaveBeenCalledWith('supabase-uid-7')
})

it('a refund (both sources say no) takes access away', async () => {
  const db = makeDb()
  await writePremiumCache(db, true, 'u1', 5)
  mockRow.mockResolvedValue(false)
  await initPremium(db)
  expect(getPremiumSnapshot()).toMatchObject({ isPremium: false, unlimited: false })
  expect((await readPremiumCache(db)).premium).toBe(false)
})

it('signed out is free, and the cache is cleared', async () => {
  const db = makeDb()
  await writePremiumCache(db, true, 'u1', 5)
  mockAuth.userId = null
  await initPremium(db)
  expect(getPremiumSnapshot().isPremium).toBe(false)
  expect((await readPremiumCache(db)).premium).toBe(false)
})

it('sign-out logs RevenueCat out and forgets Full Access on this device', async () => {
  const db = makeDb()
  mockRow.mockResolvedValue(true)
  await initPremium(db)
  expect(getPremiumSnapshot().isPremium).toBe(true)
  await signOutPremium(db)
  expect(mockStore.storeLogOut).toHaveBeenCalled()
  expect(getPremiumSnapshot().isPremium).toBe(false)
  expect((await readPremiumCache(db)).premium).toBe(false)
})

it('follows auth changes: a sign-out event clears access', async () => {
  jest.useFakeTimers()
  try {
    const db = makeDb()
    mockRow.mockResolvedValue(true)
    await initPremium(db)
    expect(mockAuth.listener).toBeTruthy()
    mockAuth.listener!('SIGNED_OUT', null)
    await jest.runAllTimersAsync()
    expect(mockStore.storeLogOut).toHaveBeenCalled()
    expect(getPremiumSnapshot().isPremium).toBe(false)
  } finally {
    jest.useRealTimers()
  }
})

it('after a web payment, polls the entitlement row until the webhook lands', async () => {
  const db = makeDb()
  await initPremium(db)
  mockRow.mockResolvedValueOnce(false).mockResolvedValueOnce(false).mockResolvedValue(true)
  expect(await pollPremium({ attempts: 5, intervalMs: 0 })).toBe(true)
  expect(getPremiumSnapshot().isPremium).toBe(true)
})

it('stops polling after the given attempts', async () => {
  const db = makeDb()
  await initPremium(db)
  mockRow.mockResolvedValue(false)
  mockRow.mockClear()
  expect(await pollPremium({ attempts: 3, intervalMs: 0 })).toBe(false)
  expect(mockRow).toHaveBeenCalledTimes(3)
})

it('stops polling once its signal is aborted (the screen closed)', async () => {
  const db = makeDb()
  await initPremium(db)
  const ctrl = new AbortController()
  mockRow.mockClear()
  mockRow.mockImplementation(async () => { ctrl.abort(); return false })
  expect(await pollPremium({ attempts: 5, intervalMs: 0, signal: ctrl.signal })).toBe(false)
  expect(mockRow).toHaveBeenCalledTimes(1)
  mockRow.mockClear()
  expect(await confirmPurchase({ attempts: 5, intervalMs: 0, signal: ctrl.signal })).toBe('pending')
  expect(mockRow).not.toHaveBeenCalled()
})

describe('confirmPurchase (after a Play purchase or restore)', () => {
  it('waits for the entitlement row, then reports confirmed', async () => {
    const db = makeDb()
    await initPremium(db)
    mockRow.mockResolvedValueOnce(false).mockResolvedValue(true)
    expect(await confirmPurchase({ attempts: 5, intervalMs: 0 })).toBe('confirmed')
    expect(getPremiumSnapshot().isPremium).toBe(true)
  })

  it('reports pending (never grants access) when the row has not arrived in time', async () => {
    const db = makeDb()
    await initPremium(db)
    mockRow.mockResolvedValue(false)
    expect(await confirmPurchase({ attempts: 3, intervalMs: 0 })).toBe('pending')
    expect(getPremiumSnapshot().isPremium).toBe(false)
    expect((await readPremiumCache(db)).premium).toBe(false)
  })
})

it('refreshPremium before init is a harmless no-op', async () => {
  expect(await refreshPremium()).toBe(false)
})

describe('buy / restore', () => {
  it('buys and restores as the signed-in Supabase user only', async () => {
    mockAuth.userId = 'supabase-uid-9'
    expect(await buyFullAccess()).toEqual({ status: 'success' })
    expect(mockStore.purchaseFullAccess).toHaveBeenCalledWith('supabase-uid-9')
    expect(await restoreFullAccessForUser()).toEqual({ status: 'success' })
    expect(mockStore.restoreFullAccess).toHaveBeenCalledWith('supabase-uid-9')
  })

  it('asks for sign-in first', async () => {
    mockAuth.userId = null
    expect(await buyFullAccess()).toEqual({ status: 'signed_out' })
    expect(await restoreFullAccessForUser()).toEqual({ status: 'signed_out' })
    expect(mockStore.purchaseFullAccess).not.toHaveBeenCalled()
  })
})

it('an account switch drops the previous access at once (no store logout racing the new login)', async () => {
  const db = makeDb()
  mockRow.mockResolvedValue(true)
  await initPremium(db)
  expect(getPremiumSnapshot().isPremium).toBe(true)
  mockRow.mockResolvedValue(false)
  forgetPremiumState()
  expect(getPremiumSnapshot().isPremium).toBe(false)
  expect(mockStore.storeLogOut).not.toHaveBeenCalled()
})

describe('account switch (the cache belongs to one account)', () => {
  it("another account never inherits the previous account's cached access, even offline", async () => {
    const db = makeDb()
    await writePremiumCache(db, true, 'u1', 5)
    mockAuth.userId = 'u2'
    mockRow.mockResolvedValue(null) // offline: the row cannot be read
    const seen: boolean[] = []
    const unsub = subscribePremium(() => seen.push(getPremiumSnapshot().isPremium))
    await initPremium(db)
    unsub()
    expect(getPremiumSnapshot().isPremium).toBe(false)
    expect(seen).not.toContain(true)
  })

  it('stores which account the cached access belongs to', async () => {
    const db = makeDb()
    mockRow.mockResolvedValue(true)
    await initPremium(db)
    expect(await readPremiumCache(db)).toMatchObject({ premium: true, userId: 'u1' })
  })

  it("drops a refresh still in flight for the previous account (its answer never lands)", async () => {
    const db = makeDb()
    await initPremium(db)
    let resolveOld!: (v: boolean | null) => void
    mockRow.mockImplementationOnce(() => new Promise(r => { resolveOld = r }))
    const old = refreshPremium()
    await new Promise(r => setTimeout(r, 0))
    // The account switches while u1's check is still running.
    mockAuth.userId = 'u2'
    mockRow.mockResolvedValue(false)
    forgetPremiumState()
    resolveOld(true)
    await old
    await new Promise(r => setTimeout(r, 0))
    await refreshPremium()
    expect(getPremiumSnapshot().isPremium).toBe(false)
    expect((await readPremiumCache(db)).premium).toBe(false)
  })

  it('after sign-out, a refresh still in flight cannot bring access back', async () => {
    const db = makeDb()
    await initPremium(db)
    let resolveOld!: (v: boolean | null) => void
    mockRow.mockImplementationOnce(() => new Promise(r => { resolveOld = r }))
    const old = refreshPremium()
    await new Promise(r => setTimeout(r, 0))
    await signOutPremium(db)
    resolveOld(true)
    await old
    expect(getPremiumSnapshot().isPremium).toBe(false)
    expect((await readPremiumCache(db)).premium).toBe(false)
  })
})
