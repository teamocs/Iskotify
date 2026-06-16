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
