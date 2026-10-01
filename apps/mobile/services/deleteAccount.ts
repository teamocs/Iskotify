import type { DrizzleClient } from '../db/client'
import { supabase } from './supabase'
import { resetStudyData } from './resetStudyData'
import { setAccountNotice, ACCOUNT_DELETED_NOTICE } from './accountNotice'
import { resetAnalytics } from '../lib/analytics'
import { signOutPremium } from './premiumState'

const ADMIN_BASE_URL = process.env.EXPO_PUBLIC_ADMIN_BASE_URL ?? 'https://iskotify.ph'
const REQUEST_TIMEOUT_MS = 30000

export const DELETE_CONFIRM_WORD = 'DELETE'

/** The student must type the word exactly (surrounding spaces are forgiven). */
export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRM_WORD
}

export type DeleteAccountResult = { ok: true } | { ok: false; error: string }

const GENERIC_ERROR =
  "We couldn't delete your account. Nothing was changed, so you can try again. If it keeps failing, email teamocsph@gmail.com."
const NETWORK_ERROR =
  "We couldn't reach the server. Check your connection and try again. Nothing was changed."
const SIGNED_OUT_ERROR =
  'Your sign-in has expired. Please sign in again, then delete your account.'

/**
 * Permanently deletes the signed-in student's account.
 *
 * The server does the real work (POST /api/account/delete on the admin host:
 * screenshot files, every row, then the login; see migration 064). It is called
 * with the student's own access token and no body, so it can only ever delete
 * the account the token belongs to. Only after it says yes do we clear this
 * device and drop the session. Deliberately NO backup push first: it would
 * re-create the very row being deleted. If the server call fails, nothing local
 * is touched and the student stays signed in.
 */
export async function deleteAccount(db: DrizzleClient): Promise<DeleteAccountResult> {
  let token: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token
  } catch (e) {
    console.warn('[deleteAccount] getSession failed:', e)
  }
  if (!token) return { ok: false, error: SIGNED_OUT_ERROR }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${ADMIN_BASE_URL}/api/account/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.warn('[deleteAccount] server said', res.status)
      if (res.status === 401) return { ok: false, error: SIGNED_OUT_ERROR }
      let message = GENERIC_ERROR
      try {
        const body = (await res.json()) as { error?: unknown }
        if (typeof body.error === 'string' && body.error) message = body.error
      } catch { /* not JSON: keep the generic message */ }
      return { ok: false, error: message }
    }
  } catch (e) {
    console.warn('[deleteAccount] request failed:', e)
    return { ok: false, error: NETWORK_ERROR }
  } finally {
    clearTimeout(timer)
  }

  // The account is gone. Whatever happens below, the deletion succeeded, so
  // local cleanup is best-effort and never turns into an error.
  try {
    await resetStudyData(db)
  } catch (e) {
    console.warn('[deleteAccount] local reset failed (non-fatal):', e)
  }
  try {
    // Local scope: the server session no longer exists, a global sign-out would 4xx.
    await supabase.auth.signOut({ scope: 'local' })
  } catch (e) {
    console.warn('[deleteAccount] signOut failed (non-fatal):', e)
  }
  // Forget the account id and stop analytics: the next person here is asked afresh.
  resetAnalytics()
  // RevenueCat forgets the account and this device starts free. Never throws.
  await signOutPremium(db)
  setAccountNotice(ACCOUNT_DELETED_NOTICE)
  return { ok: true }
}
