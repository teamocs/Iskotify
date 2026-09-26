/**
 * webEntryTarget — pure routing decision for the web auth gate.
 *
 * Used by app/_layout.tsx's web branch to decide which route to navigate
 * to after checking the Supabase session. Extracted as a pure function so it
 * can be unit-tested without any React/router dependencies.
 *
 *   no session          → '/auth/sign-in'
 *   session, no name    → '/onboarding'     (a new email account: onboarding asks the name first)
 *   session, name, no focus → '/onboarding'
 *   session, name, focus    → '/(tabs)'
 */
export type EntryTarget = '/auth/sign-in' | '/onboarding' | '/(tabs)'

export function webEntryTarget(
  hasSession: boolean,
  fullName: string | null | undefined,
  hasFocus: boolean,
): EntryTarget {
  if (!hasSession) return '/auth/sign-in'
  if (!fullName?.trim()) return '/onboarding'
  if (!hasFocus) return '/onboarding'
  return '/(tabs)'
}

// Auth routes that finish their own job (and explain their own failures):
// sign-in shows ?error=link, callback exchanges the code, reset-password says
// when a link has expired. Replacing them would drop the query string.
const AUTH_ROUTES = ['/auth/sign-in', '/auth/callback', '/auth/reset-password']
// Entry screens a signed-in, onboarded student has no business seeing.
const SIGNED_OUT_ONLY = ['/auth/sign-in', '/landing']
// Routes that route themselves once a session exists.
const SELF_ROUTING = ['/auth/callback', '/auth/reset-password']

function clean(pathname: string): string {
  const p = pathname.split(/[?#]/)[0] ?? '/'
  return p.length > 1 ? p.replace(/\/+$/, '') : p
}

/**
 * Where the web gate should send the page the student is on, or `null` to
 * stay. Staying keeps the whole URL, query included. A returning student is
 * never routed into the tour: it only opens from onboarding or from Help.
 */
export function webGateRedirect(pathname: string, target: EntryTarget): string | null {
  const path = clean(pathname)
  if (target === '/auth/sign-in') return AUTH_ROUTES.includes(path) ? null : '/auth/sign-in'
  if (SELF_ROUTING.includes(path)) return null
  if (target === '/onboarding') return path === '/onboarding' ? null : '/onboarding'
  // Onboarded. Onboarding itself is left alone: the student has a focus as soon
  // as the goal step is saved, and a reload mid-flow must resume, not leave.
  return SIGNED_OUT_ONLY.includes(path) ? '/(tabs)' : null
}
