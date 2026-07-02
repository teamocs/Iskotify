/**
 * webAuth.ts — Web-only Supabase auth helpers with friendly error mapping.
 *
 * All functions are thin wrappers around supabase.auth that:
 *  - Map cryptic Supabase error messages to student-friendly copy.
 *  - Return typed result objects (no exceptions bubble to the UI).
 *
 * Native landing.tsx keeps its own Google OAuth flow; this module is only
 * imported by the web auth screen + hooks.
 */
import { supabase } from './supabase'

// ── Validation helpers (pure, side-effect-free) ──────────────────────────────

/** Returns true when the string looks like a valid email address. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

/** Returns true when the password meets the minimum length requirement. */
export function isValidPassword(password: string): boolean {
  return password.length >= 8
}

// ── Error mapping ─────────────────────────────────────────────────────────────

const FALLBACK_ERROR = 'Something went wrong — please try again.'

function mapSignUpError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('user already exists') || m.includes('email address is already registered')) {
    return 'That email already has an account — try signing in.'
  }
  if (m.includes('password') && (m.includes('weak') || m.includes('short') || m.includes('characters'))) {
    return 'Your password is too short — use at least 8 characters.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts — please wait a moment and try again.'
  }
  if (m.includes('invalid email') || m.includes('valid email')) {
    return 'Please enter a valid email address.'
  }
  // Unmapped error: log raw message for debugging, return friendly fallback
  console.warn('[webAuth] unmapped sign-up error:', message)
  return FALLBACK_ERROR
}

function mapSignInError(message: string): string {
  const m = message.toLowerCase()
  if (
    m.includes('invalid login') ||
    m.includes('invalid credentials') ||
    m.includes('email not confirmed') ||
    m.includes('wrong password') ||
    m.includes('invalid password')
  ) {
    return "Email or password doesn't match."
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many sign-in attempts — please wait a moment and try again.'
  }
  // Unmapped error: log raw message for debugging, return friendly fallback
  console.warn('[webAuth] unmapped sign-in error:', message)
  return FALLBACK_ERROR
}

// ── Auth functions ────────────────────────────────────────────────────────────

export type AuthResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export interface SignUpData {
  /** True when Supabase returns a user but no session — email confirmation pending. */
  needsEmailConfirm: boolean
}

/**
 * Sign up with email + password.
 * Returns `needsEmailConfirm: true` when Supabase sends a confirmation email
 * instead of issuing a session immediately.
 */
export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthResult<SignUpData>> {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) {
      return { ok: false, error: mapSignUpError(error.message) }
    }
    // Supabase returns a user with no session when email confirmation is required.
    const needsEmailConfirm = !!(data.user && !data.session)
    return { ok: true, data: { needsEmailConfirm } }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/**
 * Sign in with email + password.
 */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      return { ok: false, error: mapSignInError(error.message) }
    }
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/**
 * Send a password-reset email. The link redirects to /auth/callback on the
 * current origin so the web app can exchange the token.
 *
 * The redirect carries an explicit `type=recovery` marker: Supabase preserves
 * query params on redirectTo (it appends its own ?code=), so callback.tsx can
 * deterministically detect the recovery flow from the URL (see
 * utils/recoveryUrl.ts) and route to /auth/reset-password instead of the app.
 */
export async function sendPasswordReset(email: string): Promise<AuthResult> {
  try {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback?type=recovery`
        : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    })
    if (error) {
      console.warn('[webAuth] unmapped password-reset error:', error.message)
      return { ok: false, error: FALLBACK_ERROR }
    }
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

function mapUpdatePasswordError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('different from the old') || m.includes('same password') || m.includes('same_password')) {
    return 'New password must be different from your old password.'
  }
  if (m.includes('password') && (m.includes('weak') || m.includes('short') || m.includes('characters'))) {
    return 'Your password is too short — use at least 8 characters.'
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many attempts — please wait a moment and try again.'
  }
  if (m.includes('session missing') || m.includes('session_not_found') || m.includes('not logged in') || m.includes('missing sub claim')) {
    return 'This reset link has expired — request a new one from the sign-in screen.'
  }
  // Unmapped error: log raw message for debugging, return friendly fallback
  console.warn('[webAuth] unmapped update-password error:', message)
  return FALLBACK_ERROR
}

/**
 * Set a new password for the currently-signed-in user (the recovery link signs
 * the user in before landing on /auth/reset-password).
 */
export async function updatePassword(password: string): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      return { ok: false, error: mapUpdatePasswordError(error.message) }
    }
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/**
 * Start Google OAuth flow on web — redirects the browser to Google's consent
 * screen, then back to /auth/callback on the current origin.
 */
export async function signInWithGoogleWeb(): Promise<AuthResult> {
  try {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : undefined
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (error) {
      console.warn('[webAuth] unmapped Google OAuth error:', error.message)
      return { ok: false, error: FALLBACK_ERROR }
    }
    // OAuth redirects the browser — caller doesn't need to handle data.
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}

/**
 * Sign in with a Google credential token (for One Tap / GIS callback).
 *
 * @param credential - The ID token JWT from Google's GIS callback.
 * @param nonce      - The raw (un-hashed) nonce that was passed to
 *                     google.accounts.id.initialize as SHA-256(nonce).
 *                     Supabase uses this to verify the nonce claim in the JWT.
 */
export async function signInWithGoogleIdToken(
  credential: string,
  nonce?: string,
): Promise<AuthResult> {
  try {
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: credential,
      ...(nonce !== undefined ? { nonce } : {}),
    })
    if (error) {
      console.warn('[webAuth] unmapped Google ID token error:', error.message)
      return { ok: false, error: FALLBACK_ERROR }
    }
    return { ok: true, data: undefined }
  } catch (e) {
    return { ok: false, error: 'Something went wrong. Please try again.' }
  }
}
