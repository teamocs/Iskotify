import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import { Linking } from 'react-native'
import ActivateScreen from '../activate'

// ── Expo Router ──────────────────────────────────────────────────────────────
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (p: string) => mockReplace(p) },
}))

// ── Safe area ────────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// ── Supabase ─────────────────────────────────────────────────────────────────
const mockRpc = jest.fn()
const mockSignOut = jest.fn().mockResolvedValue({})
const mockSignInWithOAuth = jest.fn()
const mockGetSession = jest.fn()
jest.mock('../../services/supabase', () => ({
  supabase: {
    rpc: (name: string) => mockRpc(name),
    auth: {
      signInWithOAuth: (opts: unknown) => mockSignInWithOAuth(opts),
      signOut: () => mockSignOut(),
      // Default: no session → mount effect stays idle.
      // Tests that need a session override this with mockGetSession.mockResolvedValueOnce.
      getSession: () => mockGetSession(),
    },
  },
}))

// ── expo-web-browser ──────────────────────────────────────────────────────────
const mockOpenAuthSession = jest.fn()
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: (url: string, redirect: string) => mockOpenAuthSession(url, redirect),
  maybeCompleteAuthSession: jest.fn(),
}))

// ── expo-linking ──────────────────────────────────────────────────────────────
jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'iskotify://auth/callback'),
}))

// ── SecureStore / earlyAccessActivation ─────────────────────────────────────
// Mock the entire utils module so we can assert setEarlyAccessActivated was called.
const mockSetActivated = jest.fn().mockResolvedValue(undefined)
jest.mock('../../utils/earlyAccessActivation', () => ({
  isEarlyAccessActivated: jest.fn().mockResolvedValue(false),
  setEarlyAccessActivated: () => mockSetActivated(),
  clearEarlyAccessActivated: jest.fn().mockResolvedValue(undefined),
}))

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Simulates a successful Google OAuth sign-in:
 *   signInWithOAuth → success URL → openAuthSessionAsync returns 'success'
 *   with a `code` param, then exchangeCodeForSession is expected to be called.
 * We bypass the full PKCE exchange by making supabase.auth.exchangeCodeForSession
 * a no-op (the screen calls it inline, not through a separate mock here — but
 * the supabase mock above doesn't expose exchangeCodeForSession; the screen
 * would crash. So we set up openAuthSessionAsync to return a URL with no `code`
 * so the screen falls into the "no code, check session" branch instead, and we
 * return a live session from getSession.
 */
/**
 * @param addMountEffectNull When true (default — call before render), prepends
 * a Once(null) so the mount effect stays idle and the real sign-in flow gets
 * the session Once. Pass false when calling after render (component already
 * mounted, mount effect already fired and consumed the beforeEach persistent null).
 */
function setupSuccessfulSignIn(addMountEffectNull = true) {
  mockSignInWithOAuth.mockResolvedValueOnce({
    data: { url: 'https://accounts.google.com/o/oauth2/auth?...' },
    error: null,
  })
  // Return a URL with no `code` param — screen will check session directly
  mockOpenAuthSession.mockResolvedValueOnce({
    type: 'success',
    url: 'iskotify://auth/callback',   // no ?code= → session branch
  })
  const session = { data: { session: { user: { id: 'u1', email: 'user@test.com' } } } }
  if (addMountEffectNull) {
    // Mount effect fires first on render and consumes Once(null) → stays idle.
    // Sign-in flow then gets Once(session).
    mockGetSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce(session)
  } else {
    // Component already mounted — mount effect already consumed the beforeEach
    // persistent null. Only add Once(session) for the sign-in flow.
    mockGetSession.mockResolvedValueOnce(session)
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockSignOut.mockResolvedValue({})
  mockSetActivated.mockResolvedValue(undefined)
  // Default: no existing session so the mount effect (deferred-session check)
  // stays idle and does not interfere with the user-initiated sign-in tests.
  mockGetSession.mockResolvedValue({ data: { session: null } })
})

describe('ActivateScreen — initial render', () => {
  it('shows the "Activate early access" heading', () => {
    render(<ActivateScreen />)
    expect(screen.getByText('Activate early access')).toBeTruthy()
  })

  it('shows the "Sign in with Google" button', () => {
    render(<ActivateScreen />)
    expect(screen.getByText('Sign in with Google')).toBeTruthy()
  })
})

describe('ActivateScreen — approved user', () => {
  it('calls setEarlyAccessActivated and navigates to /landing when status is "approved"', async () => {
    setupSuccessfulSignIn()
    mockRpc.mockResolvedValueOnce({ data: 'approved', error: null })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })

  it('calls setEarlyAccessActivated and navigates to /landing when status is "sent" (admin)', async () => {
    setupSuccessfulSignIn()
    mockRpc.mockResolvedValueOnce({ data: 'sent', error: null })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })
})

describe('ActivateScreen — not approved', () => {
  async function renderNotApproved(status: string) {
    setupSuccessfulSignIn()
    mockRpc.mockResolvedValueOnce({ data: status, error: null })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => {
      expect(screen.getByText('Not on the list yet')).toBeTruthy()
    })
  }

  it('shows the not-approved state for "pending"', async () => {
    await renderNotApproved('pending')
    expect(screen.getByText('Register for early access')).toBeTruthy()
    expect(screen.getByText('Use a different account')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockSetActivated).not.toHaveBeenCalled()
  })

  it('shows the not-approved state for "expired"', async () => {
    await renderNotApproved('expired')
    expect(screen.getByText('Register for early access')).toBeTruthy()
  })

  it('shows the not-approved state for "none"', async () => {
    await renderNotApproved('none')
    expect(screen.getByText('Register for early access')).toBeTruthy()
  })

  it('"Register for early access" opens the iskotify.ph early-access URL', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    await renderNotApproved('pending')

    fireEvent.press(screen.getByText('Register for early access'))
    expect(spy).toHaveBeenCalledWith('https://iskotify.ph/#early-access')
    spy.mockRestore()
  })

  it('"Use a different account" calls signOut and resets to idle screen', async () => {
    await renderNotApproved('pending')

    await act(async () => {
      fireEvent.press(screen.getByText('Use a different account'))
      await Promise.resolve()
    })

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    // Should be back to idle — "Sign in with Google" visible again
    expect(screen.getByText('Sign in with Google')).toBeTruthy()
  })
})

describe('ActivateScreen — sign-in failure / RPC error', () => {
  it('shows error state and "Try again" button when signInWithOAuth fails', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: {},
      error: { message: 'OAuth server error' },
    })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeTruthy()
      expect(screen.getByText('Try again')).toBeTruthy()
    })
    expect(mockReplace).not.toHaveBeenCalled()
    expect(mockSetActivated).not.toHaveBeenCalled()
  })

  it('shows error state when RPC returns an error', async () => {
    setupSuccessfulSignIn()
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network error' } })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeTruthy()
      expect(screen.getByText('Try again')).toBeTruthy()
    })
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('"Try again" re-runs sign-in from the error state', async () => {
    // First attempt: OAuth fails
    mockSignInWithOAuth.mockResolvedValueOnce({ data: {}, error: { message: 'fail' } })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())

    // Second attempt: succeeds — component already mounted, pass false to skip
    // the mount-effect Once(null) that would otherwise consume the session slot.
    setupSuccessfulSignIn(false)
    mockRpc.mockResolvedValueOnce({ data: 'approved', error: null })

    fireEvent.press(screen.getByText('Try again'))

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })

  it('returns to idle (not error) when user cancels the browser', async () => {
    mockSignInWithOAuth.mockResolvedValueOnce({
      data: { url: 'https://accounts.google.com/...' },
      error: null,
    })
    mockOpenAuthSession.mockResolvedValueOnce({ type: 'cancel' })

    render(<ActivateScreen />)
    fireEvent.press(screen.getByText('Sign in with Google'))

    await waitFor(() => expect(screen.getByText('Sign in with Google')).toBeTruthy())
    expect(mockReplace).not.toHaveBeenCalled()
  })
})

// ── Deferred-session mount effect (Edit 2) ────────────────────────────────────
// When auth/callback.tsx routes an unapproved user to /activate, a Supabase
// session already exists. The mount effect should detect it and call
// checkRpcAndRoute immediately instead of waiting for a user button press.

describe('ActivateScreen — deferred-session mount effect', () => {
  it('no existing session → mount effect stays idle, "Sign in" button visible', async () => {
    // getSession is already defaulted to { data: { session: null } } in beforeEach
    render(<ActivateScreen />)
    await waitFor(() => {
      expect(screen.getByText('Sign in with Google')).toBeTruthy()
    })
    // RPC must NOT have been called (no session → no check)
    expect(mockRpc).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('existing session + RPC returns none → shows not_approved screen', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    })
    mockRpc.mockResolvedValueOnce({ data: 'none', error: null })

    render(<ActivateScreen />)

    await waitFor(() => {
      expect(screen.getByText('Not on the list yet')).toBeTruthy()
    })
    expect(mockSetActivated).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('existing session + RPC returns sent → setActivated + replace /landing', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    })
    mockRpc.mockResolvedValueOnce({ data: 'sent', error: null })

    render(<ActivateScreen />)

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })

  it('existing session + RPC returns approved → setActivated + replace /landing', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u2' } } },
    })
    mockRpc.mockResolvedValueOnce({ data: 'approved', error: null })

    render(<ActivateScreen />)

    await waitFor(() => {
      expect(mockSetActivated).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/landing')
    })
  })

  it('existing session + RPC network error → shows error state with "Try again"', async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u3' } } },
    })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network error' } })

    render(<ActivateScreen />)

    await waitFor(() => {
      expect(screen.getByText('Something went wrong')).toBeTruthy()
      expect(screen.getByText('Try again')).toBeTruthy()
    })
    expect(mockSetActivated).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })
})
