// Who gets Full Access, as pure decisions over the current public.entitlements
// row (migration 067). The webhook routes read the row, ask these functions what
// to write, and write it. No I/O here.

export type EntitlementSource = 'play' | 'web' | 'grandfather' | 'admin'

export type EntitlementRow = {
  premium: boolean
  source: EntitlementSource
  granted_at: string | null
  revoked_at: string | null
}

/** The RevenueCat entitlement id that means Full Access. */
export const PREMIUM_ENTITLEMENT = 'premium'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

/**
 * The row to write for a purchase from `source`, or null for "leave it alone".
 * - A Play purchase never replaces a web/grandfather/admin grant (a later Play
 *   refund would otherwise revoke access someone has by another right).
 * - A web purchase over a Play grant takes over as 'web'.
 * - Re-granting an active grant keeps its original granted_at (replays are no-ops).
 */
export function planGrant(current: EntitlementRow | null, source: EntitlementSource, now: string): EntitlementRow | null {
  if (current?.premium && source === 'play' && current.source !== 'play') return null
  return {
    premium: true,
    source,
    granted_at: current?.premium ? current.granted_at ?? now : now,
    revoked_at: null,
  }
}

/** The row to write for a Play refund/expiry, or null. Only a 'play' grant is ever revoked. */
export function planRevoke(current: EntitlementRow | null, now: string): EntitlementRow | null {
  if (!current || !current.premium || current.source !== 'play') return null
  return { premium: false, source: 'play', granted_at: current.granted_at, revoked_at: now }
}

export type RevenueCatDecision =
  | { kind: 'grant'; userId: string }
  | { kind: 'revoke'; userId: string }
  | { kind: 'ignore'; reason: string }

/**
 * Maps a RevenueCat webhook `event` object to what it means for Full Access.
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export function classifyRevenueCatEvent(event: unknown): RevenueCatDecision {
  if (!event || typeof event !== 'object') return { kind: 'ignore', reason: 'malformed event' }
  const e = event as Record<string, unknown>
  const type = typeof e.type === 'string' ? e.type : ''

  const isGrant = type === 'INITIAL_PURCHASE' || type === 'NON_RENEWING_PURCHASE'
  // A refund arrives as CANCELLATION with cancel_reason CUSTOMER_SUPPORT.
  const isRevoke = type === 'EXPIRATION' || (type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT')
  if (!isGrant && !isRevoke) return { kind: 'ignore', reason: `event type ${type || '(none)'} is log-only` }

  // Our own promotional grant (after a web purchase) can echo back as an event.
  if (e.store === 'PROMOTIONAL') return { kind: 'ignore', reason: 'promotional entitlement (granted by this server)' }

  const ids = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : []
  if (!ids.includes(PREMIUM_ENTITLEMENT)) return { kind: 'ignore', reason: 'not the premium entitlement' }

  const appUserId = typeof e.app_user_id === 'string' ? e.app_user_id : ''
  if (appUserId.startsWith('$RCAnonymousID:')) return { kind: 'ignore', reason: 'anonymous RevenueCat user' }
  if (!isUuid(appUserId)) return { kind: 'ignore', reason: 'app_user_id is not a Supabase user id' }

  return { kind: isGrant ? 'grant' : 'revoke', userId: appUserId.toLowerCase() }
}
