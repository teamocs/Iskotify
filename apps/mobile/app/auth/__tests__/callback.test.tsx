/**
 * Tests for app/auth/callback.tsx
 *
 * The native early-access activation gate was removed (open access) — every
 * successful code exchange now writes the profile and enters the app
 * regardless of any early-access RPC/status, including when the network is
 * unavailable. Web branches of callback.tsx (no-code + web fallback) are
 * covered separately.
 */
import React from 'react'
import { render, waitFor, act } from '@testing-library/react-native'
import { Platform } from 'react-native'

// ── Expo Router ──────────────────────────────────────────────────────────────
const mockReplace = jest.fn()
const mockUseLocalSearchParams = jest.fn().mockReturnValue({ code: 'test-code-123' })
jest.mock('expo-router', () => ({
  router: { replace: (p: string) => mockReplace(p) },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}))

// ── expo-web-browser ──────────────────────────────────────────────────────────
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}))

// ── DB / useDb ───────────────────────────────────────────────────────────────
// Track insert calls so we can assert userSettings was (not) written.
const mockOnConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
const mockInsertValues = jest.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }))
const mockInsert = jest.fn(() => ({ values: mockInsertValues }))
const mockSelectFrom = jest.fn()
const mockDb = {
  insert: mockInsert,
  select: jest.fn(() => ({ from: mockSelectFrom })),
}

jest.mock('../../../hooks/useDb', () => ({
  useDb: () => mockDb,
}))

// ── schema ────────────────────────────────────────────────────────────────────
jest.mock('../../../db/schema', () => ({
  userSettings: 'userSettings',
  focusListings: 'focusListings',
}))

// ── drizzle eq ───────────────────────────────────────────────────────────────
jest.mock('drizzle-orm', () => ({ eq: jest.fn() }))

// ── onboardingStatus / webEntryTarget ────────────────────────────────────────
jest.mock('../../../utils/onboardingStatus', () => ({
  hasOnboardingFocus: jest.fn(() => false),
}))
jest.mock('../../../utils/webEntryTarget', () => ({
  webEntryTarget: jest.fn(() => '/onboarding'),
}))

// ── sync ─────────────────────────────────────────────────────────────────────
jest.mock('../../../services/sync', () => ({
  pullUserData: jest.fn().mockResolvedValue(undefined),
  pushUserData: jest.fn().mockResolvedValue(undefined),
}))

// ── Supabase ─────────────────────────────────────────────────────────────────
const mockExchangeCode = jest.fn()
const mockGetSession = jest.fn()
const mockGetUser = jest.fn()
const mockSupabaseFrom = jest.fn()
// Captures onAuthStateChange callbacks so tests can fire PASSWORD_RECOVERY etc.
const authStateCallbacks: Array<(event: string) => void> = []
const mockUnsubscribe = jest.fn()

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => mockExchangeCode(code),
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
      onAuthStateChange: (cb: (event: string) => void) => {
        authStateCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
      },
    },
    from: (t: string) => mockSupabaseFrom(t),
  },
}))

// ── Import component after mocks ──────────────────────────────────────────────
import AuthCallback from '../callback'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sets Supabase to successfully exchange a code and return a user. */
function setupSuccessfulExchange(userId = 'user-abc') {
  mockExchangeCode.mockResolvedValue({ error: null })
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: userId,
        email: 'u@test.com',
        user_metadata: { full_name: 'Test User' },
      },
    },
  })
  // No existing cloud backup (Supabase from().select().eq().limit().maybeSingle())
  const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null })
  const mockLimit = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
  const mockEq = jest.fn(() => ({ limit: mockLimit }))
  const mockSelectChain = jest.fn(() => ({ eq: mockEq }))
  mockSupabaseFrom.mockReturnValue({ select: mockSelectChain })
  // DB select returns empty rows (no existing local row, no focusListings)
  mockSelectFrom.mockReturnValue({
    where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
    limit: jest.fn().mockResolvedValue([]),
  })
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks()
  authStateCallbacks.length = 0
  // Default: native platform (Android)
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true })
  // Default: code param present (simulates deep-link from Google OAuth)
  mockUseLocalSearchParams.mockReturnValue({ code: 'test-code-123' })
})

// ── OPEN ACCESS: no gate blocks a successful code exchange ───────────────────
// Regression coverage for the removed native activation gate: a legitimate
// sign-in must always reach the profile-write + app-entry flow, even when a
// network/RPC call unrelated to auth fails along the way (the exact failure
// mode that used to fail-closed to /activate before the profile was created).

describe('auth/callback — open access (no early-access gate)', () => {
  it('successful exchange → userSettings insert runs, never routes to /activate', async () => {
    setupSuccessfulExchange()

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled()
    })
    expect(mockReplace).not.toHaveBeenCalledWith('/activate')
  })

  it('transient network error on the post-auth backup check still creates the profile and enters the app', async () => {
    // Regression: the old fail-closed gate ran an RPC BEFORE the userSettings
    // upsert; any network hiccup bounced the user to /activate and skipped
    // profile creation entirely. Simulate a network failure on the (now only
    // remaining) post-auth network call — the cloud-backup existence check —
    // and assert the profile is still written and the user still enters the app.
    setupSuccessfulExchange()
    const mockSelectChain = jest.fn(() => {
      throw new Error('network timeout')
    })
    mockSupabaseFrom.mockReturnValue({ select: mockSelectChain })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled()
    })
    // The user must land in onboarding/app, never bounced to a gate screen.
    expect(mockReplace).not.toHaveBeenCalledWith('/activate')
    expect(mockReplace).toHaveBeenCalledWith('/onboarding')
  })
})

// ── WEB PLATFORM: password recovery ──────────────────────────────────────────

describe('auth/callback — password recovery (web)', () => {
  // Save/restore window.location — RN jest env aliases window to global.
  const hadLocation = Object.prototype.hasOwnProperty.call(window, 'location')
  const originalLocation = (window as any).location

  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true })
  })

  afterEach(() => {
    if (hadLocation) {
      Object.defineProperty(window, 'location', {
        value: originalLocation, writable: true, configurable: true,
      })
    } else {
      delete (window as any).location
    }
  })

  it('recovery URL marker (?type=recovery) → routes to /auth/reset-password, app entry skipped', async () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://app.iskotify.ph/auth/callback?type=recovery&code=test-code-123' },
      writable: true,
      configurable: true,
    })
    mockExchangeCode.mockResolvedValue({ error: null })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/reset-password')
    })
    // Must not enter the app or write a profile on the recovery path
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/onboarding')
    expect(mockReplace).not.toHaveBeenCalledWith('/(tabs)')
  })

  it('PASSWORD_RECOVERY event → routes to /auth/reset-password', async () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://app.iskotify.ph/auth/callback' },  // no marker
      writable: true,
      configurable: true,
    })
    // No code in URL, no session → normal path would go to sign-in
    mockUseLocalSearchParams.mockReturnValue({ code: '' })
    mockGetSession.mockResolvedValue({ data: { session: null } })

    render(<AuthCallback />)

    // The screen subscribes for late PASSWORD_RECOVERY events on mount
    await waitFor(() => {
      expect(authStateCallbacks.length).toBeGreaterThan(0)
    })
    act(() => {
      authStateCallbacks.forEach((cb) => cb('PASSWORD_RECOVERY'))
    })
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/auth/reset-password')
    })
  })

  it('non-recovery web sign-in is unaffected (no reset-password routing)', async () => {
    Object.defineProperty(window, 'location', {
      value: { href: 'https://app.iskotify.ph/auth/callback?code=test-code-123' },
      writable: true,
      configurable: true,
    })
    mockExchangeCode.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'web-user', email: 'web@test.com', user_metadata: {} } },
    })
    const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null })
    const mockLimit = jest.fn(() => ({ maybeSingle: mockMaybeSingle }))
    const mockEq = jest.fn(() => ({ limit: mockLimit }))
    mockSupabaseFrom.mockReturnValue({ select: jest.fn(() => ({ eq: mockEq })) })
    mockSelectFrom.mockReturnValue({
      where: jest.fn(() => ({ limit: jest.fn().mockResolvedValue([]) })),
      limit: jest.fn().mockResolvedValue([]),
    })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled()
    })
    expect(mockReplace).not.toHaveBeenCalledWith('/auth/reset-password')
  })
})

// ── NO CODE: native fallback to /landing ─────────────────────────────────────

describe('auth/callback — no code (native)', () => {
  it('native + no code → replace /landing', async () => {
    Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true })
    mockUseLocalSearchParams.mockReturnValue({ code: '' })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })
})
