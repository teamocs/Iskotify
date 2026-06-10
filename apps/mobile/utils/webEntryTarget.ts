/**
 * webEntryTarget — pure routing decision for the web auth gate.
 *
 * Used by app/_layout.tsx's web branch to decide which route to navigate
 * to after checking the Supabase session. Extracted as a pure function so it
 * can be unit-tested without any React/router dependencies.
 *
 *   no session          → '/auth/sign-in'
 *   session, no name    → '/auth/sign-in'   (shouldn't normally happen)
 *   session, name, no focus → '/onboarding'
 *   session, name, focus    → '/(tabs)'
 */
export function webEntryTarget(
  hasSession: boolean,
  fullName: string | null | undefined,
  hasFocus: boolean,
): '/auth/sign-in' | '/onboarding' | '/(tabs)' {
  if (!hasSession) return '/auth/sign-in'
  if (!fullName?.trim()) return '/auth/sign-in'
  if (!hasFocus) return '/onboarding'
  return '/(tabs)'
}
