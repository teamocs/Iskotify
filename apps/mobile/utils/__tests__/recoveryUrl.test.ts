/**
 * Tests for utils/recoveryUrl.ts — password-recovery URL detection.
 * Covers both the query (PKCE) and hash (implicit) link shapes.
 */
import { isRecoveryUrl } from '../recoveryUrl'

describe('isRecoveryUrl', () => {
  // ── Query form (PKCE: redirectTo carries type=recovery, Supabase appends code) ──

  it('detects type=recovery in the query string', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback?type=recovery')).toBe(true)
  })

  it('detects type=recovery alongside the appended PKCE code param', () => {
    expect(
      isRecoveryUrl('https://app.iskotify.ph/auth/callback?type=recovery&code=abc123'),
    ).toBe(true)
  })

  it('detects type=recovery when it is not the first query param', () => {
    expect(
      isRecoveryUrl('https://app.iskotify.ph/auth/callback?code=abc123&type=recovery'),
    ).toBe(true)
  })

  // ── Hash form (implicit flow / older recovery links) ─────────────────────────

  it('detects type=recovery in the hash fragment', () => {
    expect(
      isRecoveryUrl(
        'https://app.iskotify.ph/auth/callback#access_token=tok&type=recovery&expires_in=3600',
      ),
    ).toBe(true)
  })

  it('detects type=recovery in a hash-route query (#/route?type=recovery)', () => {
    expect(
      isRecoveryUrl('https://app.iskotify.ph/#/auth/callback?type=recovery&code=x'),
    ).toBe(true)
  })

  it('detects type=recovery in the hash when the query has other params', () => {
    expect(
      isRecoveryUrl('https://app.iskotify.ph/auth/callback?foo=bar#type=recovery'),
    ).toBe(true)
  })

  // ── Negatives ─────────────────────────────────────────────────────────────────

  it('returns false for a plain callback URL with only a code', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback?code=abc123')).toBe(false)
  })

  it('returns false for other verification types (signup, magiclink)', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback?type=signup')).toBe(false)
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback#type=magiclink')).toBe(false)
  })

  it('does not match a value that merely starts with "recovery"', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback?type=recoveryx')).toBe(false)
  })

  it('does not match "recovery" appearing only in the path', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/type=recovery/callback')).toBe(false)
  })

  it('returns false for a URL with no query or hash', () => {
    expect(isRecoveryUrl('https://app.iskotify.ph/auth/callback')).toBe(false)
  })

  it('returns false for empty / null / undefined input', () => {
    expect(isRecoveryUrl('')).toBe(false)
    expect(isRecoveryUrl(null)).toBe(false)
    expect(isRecoveryUrl(undefined)).toBe(false)
  })
})
