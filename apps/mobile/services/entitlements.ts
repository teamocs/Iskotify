import { supabase } from './supabase'

// Server side of Iskotify Full Access (P3). The agreed contract:
//  - public.entitlements(user_id PK, premium, source, granted_at, revoked_at,
//    updated_at); a signed-in student can SELECT only their own row.
//  - POST {admin}/api/payments/checkout with the student's access token →
//    200 {checkoutUrl} | 409 {error:'already_premium'} | 503 {error:'payments_disabled'}.

const ADMIN_BASE_URL = process.env.EXPO_PUBLIC_ADMIN_BASE_URL ?? 'https://iskotify.vercel.app'
export const CHECKOUT_URL = `${ADMIN_BASE_URL}/api/payments/checkout`
const REQUEST_TIMEOUT_MS = 20000

/**
 * Full Access per the server entitlement row. true / false when the row was
 * read (no row = false); null when it could not be read (offline, server
 * error), so the caller keeps the last known state instead of locking a
 * paying student out.
 */
export async function fetchEntitlementPremium(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('entitlements')
      .select('premium, revoked_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) {
      console.warn('[entitlements] read failed:', error)
      return null
    }
    const r = data as { premium?: boolean | null; revoked_at?: string | null } | null
    return !!r?.premium && !r.revoked_at
  } catch (e) {
    console.warn('[entitlements] read failed:', e)
    return null
  }
}

export type CheckoutResult =
  | { ok: true; checkoutUrl: string }
  | { ok: false; reason: 'signed_out' | 'already_premium' | 'payments_disabled' | 'network' | 'error' }

/** Ask the admin host for a PayMongo checkout session for the signed-in student. */
export async function requestCheckout(): Promise<CheckoutResult> {
  let token: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token
  } catch (e) {
    console.warn('[entitlements] getSession failed:', e)
  }
  if (!token) return { ok: false, reason: 'signed_out' }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    let body: { checkoutUrl?: unknown; error?: unknown } = {}
    try { body = (await res.json()) as typeof body } catch { /* not JSON */ }
    if (res.ok) {
      const url = typeof body.checkoutUrl === 'string' ? body.checkoutUrl : ''
      // Only ever send the student to a real https checkout page.
      if (/^https:\/\//i.test(url)) return { ok: true, checkoutUrl: url }
      console.warn('[entitlements] checkout answered without a usable link')
      return { ok: false, reason: 'error' }
    }
    if (res.status === 401) return { ok: false, reason: 'signed_out' }
    if (res.status === 409 || body.error === 'already_premium') return { ok: false, reason: 'already_premium' }
    if (res.status === 503 || body.error === 'payments_disabled') return { ok: false, reason: 'payments_disabled' }
    console.warn('[entitlements] checkout failed:', res.status)
    return { ok: false, reason: 'error' }
  } catch (e) {
    console.warn('[entitlements] checkout request failed:', e)
    return { ok: false, reason: 'network' }
  } finally {
    clearTimeout(timer)
  }
}
