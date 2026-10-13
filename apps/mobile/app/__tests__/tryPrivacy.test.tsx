// The web glimpse's privacy behaviour, end to end through the restyled /try
// (iOS redesign P4 must keep it exactly): opening the guest diagnostic marks
// THIS tab in sessionStorage (services/guestPreviewMarker.ts), and a run left
// on a shared browser without a fresh marker is cleared before the new guest
// starts, so it is never shown to, or merged into, the next visitor (RA 10173).
// Only the network and storage edges are mocked; useGuestMode, guestPreview
// and the marker are the real modules.
import React from 'react'
import { Platform } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => false },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('../../services/guestSession', () => ({ isSignedOutWebGuest: async () => true }))
const mockReset = jest.fn(async () => {})
jest.mock('../../services/resetStudyData', () => ({ resetStudyData: () => mockReset() }))
jest.mock('../../services/sync', () => ({ syncOnLaunch: async () => {} }))
jest.mock('../../db/webPersist', () => ({ scheduleWebPersist: () => {} }))
jest.mock('../../lib/analytics', () => ({ resetAnalytics: () => {}, capture: () => {} }))
jest.mock('../../services/examBlueprints', () => ({ listRunnableBlueprints: async () => [] }))
jest.mock('../../hooks/useDb', () => {
  const chain = { from: () => chain, where: () => chain, limit: async () => [] }
  const insertChain = { values: () => insertChain, onConflictDoNothing: async () => {} }
  const db = { select: () => chain, insert: () => insertChain }
  return { useDb: () => db }
})

import TryScreen from '../try'
import { GUEST_PREVIEW_MARKER_KEY, GUEST_PREVIEW_MARKER_TTL_MS } from '../../services/guestPreviewMarker'
import { _resetGuestPreviewForTests } from '../../services/guestPreview'

function fakeStorage(initial: string | null) {
  const map = new Map<string, string>()
  if (initial !== null) map.set(GUEST_PREVIEW_MARKER_KEY, initial)
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v) } }
}

const g = globalThis as { sessionStorage?: unknown }
let restoreOS: { restore(): void } | null = null

beforeEach(() => {
  _resetGuestPreviewForTests()
  mockReset.mockClear()
  restoreOS = jest.replaceProperty(Platform, 'OS', 'web')
})
afterEach(() => {
  restoreOS?.restore()
  delete g.sessionStorage
})

describe('/try keeps the guest preview tab-scoped (privacy)', () => {
  it('opening the diagnostic marks this tab in sessionStorage', async () => {
    const storage = fakeStorage(null)
    g.sessionStorage = storage
    render(<TryScreen />)
    expect(await screen.findByRole('button', { name: 'Start the diagnostic' })).toBeTruthy()
    const at = Number(storage.map.get(GUEST_PREVIEW_MARKER_KEY))
    expect(Number.isFinite(at)).toBe(true)
    expect(Date.now() - at).toBeLessThan(60_000)
  })

  it('a run left on a shared browser (no marker in this tab) is cleared before the new guest starts', async () => {
    g.sessionStorage = fakeStorage(null)
    render(<TryScreen />)
    await screen.findByRole('button', { name: 'Start the diagnostic' })
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it('a stale marker (past the TTL) counts as another visitor: cleared, never merged', async () => {
    g.sessionStorage = fakeStorage(String(Date.now() - GUEST_PREVIEW_MARKER_TTL_MS - 1000))
    render(<TryScreen />)
    await screen.findByRole('button', { name: 'Start the diagnostic' })
    expect(mockReset).toHaveBeenCalledTimes(1)
  })

  it("this tab's own fresh run is kept (so it can be merged at sign-up)", async () => {
    g.sessionStorage = fakeStorage(String(Date.now() - 60_000))
    render(<TryScreen />)
    await screen.findByRole('button', { name: 'Start the diagnostic' })
    expect(mockReset).not.toHaveBeenCalled()
  })

  it('has one primary action: Start the diagnostic', async () => {
    const { countPrimaryActions } = require('../../test-utils/primaryActions')
    g.sessionStorage = fakeStorage(null)
    const { UNSAFE_root } = render(<TryScreen />)
    await screen.findByRole('button', { name: 'Start the diagnostic' })
    expect(countPrimaryActions(UNSAFE_root)).toBe(1)
  })
})
