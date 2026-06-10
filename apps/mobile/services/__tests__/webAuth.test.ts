/**
 * TDD tests for services/webAuth.ts
 * Run under the 'services' jest project (node env, babel-jest).
 */
import {
  isValidEmail,
  isValidPassword,
  signUpWithEmail,
  signInWithEmail,
  sendPasswordReset,
  signInWithGoogleWeb,
  signInWithGoogleIdToken,
} from '../webAuth'

// ── Mock supabase ─────────────────────────────────────────────────────────────

const mockSignUp = jest.fn()
const mockSignInWithPassword = jest.fn()
const mockResetPasswordForEmail = jest.fn()
const mockSignInWithOAuth = jest.fn()
const mockSignInWithIdToken = jest.fn()

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      signUp: (...args: any[]) => mockSignUp(...args),
      signInWithPassword: (...args: any[]) => mockSignInWithPassword(...args),
      resetPasswordForEmail: (...args: any[]) => mockResetPasswordForEmail(...args),
      signInWithOAuth: (...args: any[]) => mockSignInWithOAuth(...args),
      signInWithIdToken: (...args: any[]) => mockSignInWithIdToken(...args),
    },
  },
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  // Provide a minimal window.location for sendPasswordReset / signInWithGoogleWeb
  ;(global as any).window = { location: { origin: 'https://iskotify.app' } }
})

afterEach(() => {
  delete (global as any).window
  jest.restoreAllMocks()
})

// ── Validation helpers ────────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('accepts a standard email', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })

  it('accepts email with plus alias', () => {
    expect(isValidEmail('user+tag@example.co.ph')).toBe(true)
  })

  it('rejects empty string', () => {
    expect(isValidEmail('')).toBe(false)
  })

  it('rejects missing @', () => {
    expect(isValidEmail('notanemail')).toBe(false)
  })

  it('rejects missing domain', () => {
    expect(isValidEmail('user@')).toBe(false)
  })

  it('rejects spaces', () => {
    expect(isValidEmail('user @example.com')).toBe(false)
  })
})

describe('isValidPassword', () => {
  it('accepts 8-character password', () => {
    expect(isValidPassword('12345678')).toBe(true)
  })

  it('accepts longer password', () => {
    expect(isValidPassword('correcthorsebatterystaple')).toBe(true)
  })

  it('rejects 7-character password', () => {
    expect(isValidPassword('1234567')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidPassword('')).toBe(false)
  })
})

// ── signUpWithEmail ───────────────────────────────────────────────────────────

describe('signUpWithEmail', () => {
  it('returns ok:true with needsEmailConfirm:false when session is present', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'uid' }, session: { access_token: 'tok' } },
      error: null,
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.needsEmailConfirm).toBe(false)
    }
  })

  it('returns needsEmailConfirm:true when session is null (email confirmation needed)', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: { id: 'uid' }, session: null },
      error: null,
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.needsEmailConfirm).toBe(true)
    }
  })

  it('maps "already registered" error to friendly message', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('That email already has an account — try signing in.')
    }
  })

  it('maps "email address is already registered" to friendly message', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Email address is already registered' },
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('That email already has an account — try signing in.')
    }
  })

  it('maps weak password error to friendly message', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'Password should be at least 6 characters' },
    })
    const result = await signUpWithEmail('user@example.com', 'pw')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/too short/i)
    }
  })

  it('maps rate limit error to friendly message', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'rate limit exceeded' },
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/wait/i)
    }
  })

  it('returns ok:false when supabase throws', async () => {
    mockSignUp.mockRejectedValue(new Error('network error'))
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
  })

  it('returns friendly fallback for unmapped sign-up errors and warns', async () => {
    mockSignUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'some_unknown_supabase_code' },
    })
    const result = await signUpWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Something went wrong — please try again.')
    }
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unmapped sign-up/),
      'some_unknown_supabase_code',
    )
  })
})

// ── signInWithEmail ───────────────────────────────────────────────────────────

describe('signInWithEmail', () => {
  it('returns ok:true on success', async () => {
    mockSignInWithPassword.mockResolvedValue({ error: null })
    const result = await signInWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(true)
  })

  it('maps "Invalid login credentials" to friendly message', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    })
    const result = await signInWithEmail('user@example.com', 'wrongpass')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("Email or password doesn't match.")
    }
  })

  it('maps "email not confirmed" to same friendly message', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'Email not confirmed' },
    })
    const result = await signInWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe("Email or password doesn't match.")
    }
  })

  it('maps rate limit error to friendly message', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'too many requests' },
    })
    const result = await signInWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/wait/i)
    }
  })

  it('returns ok:false when supabase throws', async () => {
    mockSignInWithPassword.mockRejectedValue(new Error('network'))
    const result = await signInWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
  })

  it('returns friendly fallback for unmapped sign-in errors and warns', async () => {
    mockSignInWithPassword.mockResolvedValue({
      error: { message: 'some_unexpected_server_error' },
    })
    const result = await signInWithEmail('user@example.com', 'password123')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Something went wrong — please try again.')
    }
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unmapped sign-in/),
      'some_unexpected_server_error',
    )
  })
})

// ── sendPasswordReset ────────────────────────────────────────────────────────

describe('sendPasswordReset', () => {
  it('calls resetPasswordForEmail with correct redirectTo', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: null })
    const result = await sendPasswordReset('user@example.com')
    expect(result.ok).toBe(true)
    expect(mockResetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://iskotify.app/auth/callback',
    })
  })

  it('returns ok:false with friendly fallback on supabase error', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'Email not found' } })
    const result = await sendPasswordReset('nobody@example.com')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      // M3: raw message no longer leaked — friendly fallback is returned
      expect(result.error).toBe('Something went wrong — please try again.')
    }
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unmapped password-reset/),
      'Email not found',
    )
  })

  it('returns ok:false when supabase throws', async () => {
    mockResetPasswordForEmail.mockRejectedValue(new Error('network'))
    const result = await sendPasswordReset('user@example.com')
    expect(result.ok).toBe(false)
  })
})

// ── signInWithGoogleWeb ───────────────────────────────────────────────────────

describe('signInWithGoogleWeb', () => {
  it('calls signInWithOAuth with google provider and correct redirectTo', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: null })
    const result = await signInWithGoogleWeb()
    expect(result.ok).toBe(true)
    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://iskotify.app/auth/callback' },
    })
  })

  it('returns ok:false with friendly fallback on supabase error', async () => {
    mockSignInWithOAuth.mockResolvedValue({ error: { message: 'OAuth failed' } })
    const result = await signInWithGoogleWeb()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Something went wrong — please try again.')
    }
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unmapped Google OAuth/),
      'OAuth failed',
    )
  })

  it('returns ok:false when supabase throws', async () => {
    mockSignInWithOAuth.mockRejectedValue(new Error('network'))
    const result = await signInWithGoogleWeb()
    expect(result.ok).toBe(false)
  })
})

// ── signInWithGoogleIdToken ───────────────────────────────────────────────────

describe('signInWithGoogleIdToken', () => {
  it('calls signInWithIdToken with google provider, token, and nonce', async () => {
    mockSignInWithIdToken.mockResolvedValue({ error: null })
    const result = await signInWithGoogleIdToken('id-token-xyz', 'raw-nonce-abc')
    expect(result.ok).toBe(true)
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'id-token-xyz',
      nonce: 'raw-nonce-abc',
    })
  })

  it('calls signInWithIdToken without nonce when nonce is omitted', async () => {
    mockSignInWithIdToken.mockResolvedValue({ error: null })
    const result = await signInWithGoogleIdToken('id-token-xyz')
    expect(result.ok).toBe(true)
    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
      provider: 'google',
      token: 'id-token-xyz',
    })
  })

  it('returns ok:false with friendly fallback on supabase error', async () => {
    mockSignInWithIdToken.mockResolvedValue({ error: { message: 'Invalid token' } })
    const result = await signInWithGoogleIdToken('bad-token', 'nonce')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Something went wrong — please try again.')
    }
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringMatching(/unmapped Google ID token/),
      'Invalid token',
    )
  })

  it('returns ok:false when supabase throws', async () => {
    mockSignInWithIdToken.mockRejectedValue(new Error('network'))
    const result = await signInWithGoogleIdToken('id-token')
    expect(result.ok).toBe(false)
  })
})
