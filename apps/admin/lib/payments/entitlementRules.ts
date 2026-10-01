// What a RevenueCat webhook event means for Full Access, as pure decisions. The
// grant/revoke rules themselves (play never overrides web/grandfather/admin,
// only 'play' is ever revoked) are enforced atomically in SQL by migration 067's
// grant_entitlement / revoke_play_entitlement. No I/O here.

export type EntitlementSource = 'play' | 'web' | 'grandfather' | 'admin'

/** The RevenueCat entitlement id that means Full Access. */
export const PREMIUM_ENTITLEMENT = 'premium'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export type RevenueCatDecision =
  | { kind: 'grant'; userId: string }
  | { kind: 'revoke'; userId: string }
  | { kind: 'transfer'; revokeFrom: string[]; grantTo: string[] }
  | { kind: 'ignore'; reason: string }

/** Supabase user ids in a RevenueCat id list (anonymous and other ids dropped), lower-cased, unique. */
function userIds(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter(isUuid).map(id => id.toLowerCase()))]
}

/**
 * Maps a RevenueCat webhook `event` object to what it means for Full Access.
 * Only PRODUCTION events count unless `allowSandbox` (internal testing).
 * https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
 */
export function classifyRevenueCatEvent(event: unknown, opts: { allowSandbox: boolean }): RevenueCatDecision {
  if (!event || typeof event !== 'object') return { kind: 'ignore', reason: 'malformed event' }
  const e = event as Record<string, unknown>
  const type = typeof e.type === 'string' ? e.type : ''

  const isGrant = type === 'INITIAL_PURCHASE' || type === 'NON_RENEWING_PURCHASE'
  // A refund arrives as CANCELLATION with cancel_reason CUSTOMER_SUPPORT.
  const isRevoke = type === 'EXPIRATION' || (type === 'CANCELLATION' && e.cancel_reason === 'CUSTOMER_SUPPORT')
  const isTransfer = type === 'TRANSFER'
  if (!isGrant && !isRevoke && !isTransfer) return { kind: 'ignore', reason: `event type ${type || '(none)'} is log-only` }

  if (e.environment !== 'PRODUCTION' && !opts.allowSandbox) {
    return { kind: 'ignore', reason: `environment ${String(e.environment)} (sandbox not allowed)` }
  }

  // Our own promotional grant (after a web purchase) can echo back as an event.
  if (e.store === 'PROMOTIONAL') return { kind: 'ignore', reason: 'promotional entitlement (granted by this server)' }

  if (isTransfer) {
    // The only product is Full Access, so a transfer moves premium. If RevenueCat
    // names the entitlements, premium must be among them.
    if (Array.isArray(e.entitlement_ids) && !e.entitlement_ids.includes(PREMIUM_ENTITLEMENT)) {
      return { kind: 'ignore', reason: 'transfer does not involve premium' }
    }
    const revokeFrom = userIds(e.transferred_from)
    const grantTo = userIds(e.transferred_to)
    if (revokeFrom.length === 0 && grantTo.length === 0) return { kind: 'ignore', reason: 'transfer between non-Supabase ids' }
    return { kind: 'transfer', revokeFrom, grantTo }
  }

  const ids = Array.isArray(e.entitlement_ids) ? e.entitlement_ids : []
  if (!ids.includes(PREMIUM_ENTITLEMENT)) return { kind: 'ignore', reason: 'not the premium entitlement' }

  const appUserId = typeof e.app_user_id === 'string' ? e.app_user_id : ''
  if (appUserId.startsWith('$RCAnonymousID:')) return { kind: 'ignore', reason: 'anonymous RevenueCat user' }
  if (!isUuid(appUserId)) return { kind: 'ignore', reason: 'app_user_id is not a Supabase user id' }

  return { kind: isGrant ? 'grant' : 'revoke', userId: appUserId.toLowerCase() }
}

const scalar = (v: unknown): string | number | null =>
  typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v)) ? v : null

/**
 * The purchase facts kept in payment_events.payload: never a user id, alias,
 * transfer id or subscriber attribute (names, emails, phones).
 */
export function minimalRevenueCatPayload(e: Record<string, unknown>) {
  return {
    event_id: scalar(e.id),
    type: scalar(e.type),
    environment: scalar(e.environment),
    store: scalar(e.store),
    product_id: scalar(e.product_id),
    transaction_id: scalar(e.transaction_id),
    original_transaction_id: scalar(e.original_transaction_id),
    amount: scalar(e.price_in_purchased_currency),
    currency: scalar(e.currency),
    cancel_reason: scalar(e.cancel_reason),
    expiration_reason: scalar(e.expiration_reason),
  }
}
