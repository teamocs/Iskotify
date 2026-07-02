/**
 * utils/recoveryUrl.ts — pure helper to detect Supabase password-recovery URLs.
 *
 * A reset-password email can land on /auth/callback in two shapes:
 *  1. Query form (PKCE):  https://app/auth/callback?type=recovery&code=xxxx
 *     (sendPasswordReset() puts type=recovery in redirectTo; Supabase appends
 *      the ?code= param to it on redirect.)
 *  2. Hash form (implicit / older links):
 *     https://app/auth/callback#access_token=...&type=recovery&...
 *
 * This helper is deliberately dependency-free (no URL/URLSearchParams) so it is
 * safe on native Hermes and trivially unit-testable in node.
 */

/** True when any `type=recovery` param appears in the query or hash of `url`. */
export function isRecoveryUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const qIdx = url.indexOf('?')
  const hIdx = url.indexOf('#')
  const candidates = [qIdx, hIdx].filter((i) => i !== -1)
  if (candidates.length === 0) return false
  const start = Math.min(...candidates)
  // Everything after the first ? or # — split on all param delimiters so mixed
  // forms like "#/route?type=recovery" or "#a=b&type=recovery" both work.
  return url
    .slice(start + 1)
    .split(/[?&#]/)
    .some((pair) => {
      const eq = pair.indexOf('=')
      if (eq === -1) return false
      return pair.slice(0, eq) === 'type' && pair.slice(eq + 1) === 'recovery'
    })
}
