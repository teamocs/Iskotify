/**
 * earlyAccess — the early-access build expiry gate.
 *
 * The early-access (free trial) builds stop working on 2026-08-02 (UTC). After
 * that date the app routes every launch to `app/expired.tsx` so users export or
 * sync their data instead of using a stale, unsupported build.
 *
 * Pure module (no React / RN deps) so it is trivially unit-testable and safe to
 * import from both the native and web branches of app/_layout.tsx.
 */

// 2026-08-02 00:00 UTC. Month is zero-indexed, so August = 7.
export const EARLY_ACCESS_EXPIRY_MS = Date.UTC(2026, 7, 2)

/**
 * True once the early-access window has closed. Pass an explicit `now` (ms epoch)
 * for deterministic tests; defaults to the current time.
 */
export function isEarlyAccessExpired(now: number = Date.now()): boolean {
  return now >= EARLY_ACCESS_EXPIRY_MS
}

// ── Approved-account gate (separate from the expiry gate above) ────────────────
//
// DORMANT. The approved-account gate (block signed-in users whose
// early_access_status is not 'approved'/'sent', routing them to
// /early-access-required) is NOT production-ready: the approval + APK-email
// pipeline needs RESEND_API_KEY + a verified domain to go live. While it was
// active, signed-in users were bounced to the early-access page on every web
// refresh (and felt "logged out"). Keep it OFF until the pipeline is live, then
// flip this to true to re-enable. Mirrors the dormant pattern of the expiry gate.
export const EARLY_ACCESS_GATE_ENABLED = false

/**
 * Whether a signed-in user with the given early_access_status should be blocked
 * (redirected to /early-access-required). Returns false whenever the gate is
 * disabled, so callers stay one-liners. `enabled` defaults to the dormant flag.
 */
export function shouldBlockForEarlyAccess(
  status: string | null | undefined,
  enabled: boolean = EARLY_ACCESS_GATE_ENABLED,
): boolean {
  if (!enabled) return false
  return status !== 'approved' && status !== 'sent'
}
