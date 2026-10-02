/**
 * The web glimpse (P4): a signed-out visitor tries the free diagnostic. The
 * device gets the smallest settings row the practice hooks need (no name, no
 * onboarding, no consent), the public catalog is mirrored, and nothing of the
 * student's is pushed or pulled. Analytics stays off.
 */
import { startGuestPreview, ensureGuestSettings, _resetGuestPreviewForTests } from '../guestPreview'

const mockSyncOnLaunch = jest.fn(async (..._a: unknown[]) => undefined)
const mockPushUserData = jest.fn()
const mockPullUserData = jest.fn()
const mockReconcile = jest.fn()
jest.mock('../sync', () => ({
  syncOnLaunch: (...a: unknown[]) => mockSyncOnLaunch(...a),
  pushUserData: (...a: unknown[]) => mockPushUserData(...a),
  pullUserData: (...a: unknown[]) => mockPullUserData(...a),
  reconcileAccountOwner: (...a: unknown[]) => mockReconcile(...a),
}))
const mockMarkFirstSyncDone = jest.fn()
jest.mock('../syncStatus', () => ({ markFirstSyncDone: () => mockMarkFirstSyncDone() }))
const mockResetAnalytics = jest.fn()
const mockSetConsent = jest.fn()
jest.mock('../../lib/analytics', () => ({
  resetAnalytics: () => mockResetAnalytics(),
  setAnalyticsConsent: (v: boolean) => mockSetConsent(v),
}))
jest.mock('../../db/webPersist', () => ({ scheduleWebPersist: jest.fn() }))

type Row = Record<string, unknown> | undefined
function makeDb(row: Row) {
  const inserts: { values: unknown; conflict: string }[] = []
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (row ? [row] : []) }) }) }),
    insert: () => ({
      values: (values: unknown) => ({
        onConflictDoNothing: async () => { inserts.push({ values, conflict: 'nothing' }) },
        onConflictDoUpdate: async () => { inserts.push({ values, conflict: 'update' }) },
      }),
    }),
  }
  return { db: db as never, inserts }
}

beforeEach(() => {
  jest.clearAllMocks()
  _resetGuestPreviewForTests()
})

describe('ensureGuestSettings', () => {
  it('creates only the bare row (id 1) and never overwrites an existing one', async () => {
    const { db, inserts } = makeDb(undefined)
    await ensureGuestSettings(db)
    expect(inserts).toEqual([{ values: { id: 1 }, conflict: 'nothing' }])
  })
})

describe('startGuestPreview', () => {
  it('on a fresh browser: bare settings row, catalog-only sync, analytics off', async () => {
    const { db, inserts } = makeDb(undefined)
    const { state, catalog } = await startGuestPreview(db)
    await catalog
    expect(state).toBe('guest')
    expect(inserts).toEqual([{ values: { id: 1 }, conflict: 'nothing' }])
    // No consent, no name, no onboarding marker is written.
    const written = inserts[0]!.values as Record<string, unknown>
    for (const k of ['fullName', 'consentedAt', 'consentVersion', 'ageBand', 'onboardingStep', 'ownerUserId', 'analyticsOptIn']) {
      expect(written).not.toHaveProperty(k)
    }
    expect(mockSyncOnLaunch).toHaveBeenCalledTimes(1)
    expect(mockSyncOnLaunch).toHaveBeenCalledWith(db, { guest: true })
    // The first-sync overlay is the page's own loading state, not a full-screen cover.
    expect(mockMarkFirstSyncDone).toHaveBeenCalled()
    expect(mockResetAnalytics).toHaveBeenCalled()
    expect(mockSetConsent).not.toHaveBeenCalledWith(true)
  })

  it('never pushes, pulls or claims the device for an account', async () => {
    const { db } = makeDb(undefined)
    await (await startGuestPreview(db)).catalog
    expect(mockPushUserData).not.toHaveBeenCalled()
    expect(mockPullUserData).not.toHaveBeenCalled()
    expect(mockReconcile).not.toHaveBeenCalled()
  })

  it('starts the catalog sync once per page load', async () => {
    const { db } = makeDb(undefined)
    await (await startGuestPreview(db)).catalog
    await (await startGuestPreview(db)).catalog
    expect(mockSyncOnLaunch).toHaveBeenCalledTimes(1)
  })

  it('a failed catalog sync still settles (the page falls back to what is local)', async () => {
    mockSyncOnLaunch.mockRejectedValueOnce(new Error('offline'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    const { db } = makeDb(undefined)
    await expect((await startGuestPreview(db)).catalog).resolves.toBeUndefined()
  })

  it('a browser holding a signed-out account is left alone: no row, no sync, nothing mixed in', async () => {
    const { db, inserts } = makeDb({ id: 1, ownerUserId: 'user-a', fullName: 'Ana' })
    const { state, catalog } = await startGuestPreview(db)
    await catalog
    expect(state).toBe('held')
    expect(inserts).toEqual([])
    expect(mockSyncOnLaunch).not.toHaveBeenCalled()
    expect(mockResetAnalytics).toHaveBeenCalled()
  })

  it('a guest returning to the same browser keeps their row and results', async () => {
    const { db, inserts } = makeDb({ id: 1, ownerUserId: '', fullName: '', lastSyncedAt: 5 })
    const { state } = await startGuestPreview(db)
    expect(state).toBe('guest')
    expect(inserts).toEqual([{ values: { id: 1 }, conflict: 'nothing' }])
  })
})
