/**
 * Tests for app/auth/callback.tsx
 *
 * The native early-access gate (Edit 1) is the main focus:
 *   - Not-activated + RPC 'none'  → router.replace('/activate'), no DB write
 *   - Not-activated + RPC 'pending' → router.replace('/activate'), no DB write
 *   - RPC throws (network error)  → fail-closed → /activate, no DB write
 *   - Not-activated + RPC 'sent'  → setEarlyAccessActivated + normal flow
 *   - Not-activated + RPC 'approved' → setEarlyAccessActivated + normal flow
 *   - Already activated (flag=true) → gate skipped, RPC not called, normal flow
 *   - Web platform                 → gate never runs (Platform.OS = 'web')
 *
 * Web branches of callback.tsx (no-code + web fallback) are tested separately
 * and must remain unaffected by the native gate.
 */
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
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

// ── earlyAccessActivation ─────────────────────────────────────────────────────
const mockIsActivated = jest.fn()
const mockSetActivated = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../utils/earlyAccessActivation', () => ({
  isEarlyAccessActivated: () => mockIsActivated(),
  setEarlyAccessActivated: () => mockSetActivated(),
  clearEarlyAccessActivated: jest.fn().mockResolvedValue(undefined),
}))

// ── Supabase ─────────────────────────────────────────────────────────────────
const mockExchangeCode = jest.fn()
const mockGetSession = jest.fn()
const mockGetUser = jest.fn()
const mockRpc = jest.fn()
const mockSupabaseFrom = jest.fn()

jest.mock('../../../services/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (code: string) => mockExchangeCode(code),
      getSession: () => mockGetSession(),
      getUser: () => mockGetUser(),
    },
    rpc: (name: string) => mockRpc(name),
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
  mockSetActivated.mockResolvedValue(undefined)
  // Default: native platform (Android)
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true })
  // Default: code param present (simulates deep-link from Google OAuth)
  mockUseLocalSearchParams.mockReturnValue({ code: 'test-code-123' })
})

// ── NATIVE GATE: unapproved / fail-closed ─────────────────────────────────────

describe('auth/callback — native early-access gate: blocking cases', () => {
  it('not-activated + RPC returns none → router.replace(/activate), no userSettings insert', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(false)
    mockRpc.mockResolvedValue({ data: 'none', error: null })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/activate')
    })
    // Profile must NOT be written
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockOnConflictDoUpdate).not.toHaveBeenCalled()
  })

  it('not-activated + RPC returns pending → router.replace(/activate), no userSettings insert', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(false)
    mockRpc.mockResolvedValue({ data: 'pending', error: null })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/activate')
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('not-activated + RPC throws → fail-closed → /activate, no userSettings insert', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(false)
    mockRpc.mockRejectedValue(new Error('network timeout'))

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/activate')
    })
    expect(mockInsert).not.toHaveBeenCalled()
  })
})

// ── NATIVE GATE: approved / activated pass-through ────────────────────────────

describe('auth/callback — native early-access gate: pass-through cases', () => {
  it('not-activated + RPC returns sent → setEarlyAccessActivated called, insert runs', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(false)
    mockRpc.mockResolvedValue({ data: 'sent', error: null })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
    })
    // Normal profile-write flow must run
    expect(mockInsert).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/activate')
  })

  it('not-activated + RPC returns approved → setEarlyAccessActivated called, insert runs', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(false)
    mockRpc.mockResolvedValue({ data: 'approved', error: null })

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
    })
    expect(mockInsert).toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/activate')
  })

  it('already activated (flag=true) → gate skipped, RPC not called, insert runs', async () => {
    setupSuccessfulExchange()
    mockIsActivated.mockResolvedValue(true)

    render(<AuthCallback />)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled()
    })
    // Gate must be skipped: no RPC, no setActivated
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockSetActivated).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalledWith('/activate')
  })
})

// ── WEB PLATFORM: gate must never fire ───────────────────────────────────────

describe('auth/callback — web platform (gate bypassed)', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', { get: () => 'web', configurable: true })
  })

  it('on web: gate skipped even when not activated; RPC never called; insert runs', async () => {
    mockIsActivated.mockResolvedValue(false)
    mockExchangeCode.mockResolvedValue({ error: null })
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'web-user',
          email: 'web@test.com',
          user_metadata: {},
        },
      },
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
      // Normal web flow: insert runs, /activate never called
      expect(mockInsert).toHaveBeenCalled()
      expect(mockReplace).not.toHaveBeenCalledWith('/activate')
    })
    // Gate must NOT have called the RPC
    expect(mockRpc).not.toHaveBeenCalled()
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
