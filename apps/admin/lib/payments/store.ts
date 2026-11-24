import type { createServerClient } from '@iskotify/utils'
import { isUuid, type EntitlementSource } from './entitlementRules'

// Database side of the payment webhooks (migration 067), over the service-role
// client. Every function throws on a database error so the route can answer 500
// and let the provider retry.

type Db = ReturnType<typeof createServerClient>

export type PaymentEvent = {
  id: string
  provider: 'paymongo' | 'revenuecat' | 'mock'
  user_id: string | null
  type: string
  amount_centavos: number | null
  /** A minimal record (see minimalPaymongoPayload / minimalRevenueCatPayload), never the raw body. */
  payload: Record<string, unknown>
}

/**
 * Inserts the event. 'duplicate' only when its id was already recorded AND fully
 * processed (migration 071): a retry of an event whose processing failed or died
 * half-way must run again. Grants and revokes are idempotent, so that is safe.
 */
export async function recordEvent(db: Db, event: PaymentEvent): Promise<'recorded' | 'duplicate'> {
  const { error } = await db.from('payment_events').insert(event)
  if (!error) return 'recorded'
  if (error.code !== '23505') throw new Error(`payment_events insert failed: ${error.message}`)
  const { data, error: readError } = await db.from('payment_events').select('processed_at').eq('id', event.id).maybeSingle()
  if (readError) throw new Error(`payment_events lookup failed: ${readError.message}`)
  return data?.processed_at ? 'duplicate' : 'recorded'
}

/** Marks an event fully processed, after its entitlement writes: later replays are no-ops. */
export async function markProcessed(db: Db, id: string): Promise<void> {
  const { error } = await db.from('payment_events').update({ processed_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`payment_events update failed: ${error.message}`)
}

/** True when `id` is a uuid of an existing auth user. */
export async function userExists(db: Db, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false
  const { data, error } = await db.auth.admin.getUserById(id)
  if (data?.user) return true
  if (error && (error as { status?: number }).status !== 404) throw new Error(`user lookup failed: ${error.message}`)
  return false
}

/**
 * Grants Full Access through the atomic SQL function (067). False when the rules
 * left the row alone (a Play grant never overrides web/grandfather/admin).
 */
export async function grantEntitlement(db: Db, userId: string, source: EntitlementSource): Promise<boolean> {
  const { data, error } = await db.rpc('grant_entitlement', { p_uid: userId, p_source: source })
  if (error) throw new Error(`grant_entitlement failed: ${error.message}`)
  return data === true
}

/**
 * Applies a Play purchase (premium) or refund/expiry/transfer-away (not premium) by the
 * time it happened (075). False when a newer Play event was already applied. Never
 * touches an active web/grandfather/admin grant.
 */
export async function applyPlayEvent(db: Db, userId: string, premium: boolean, eventAt: string | null): Promise<boolean> {
  const { data, error } = await db.rpc('apply_play_event', { p_uid: userId, p_premium: premium, p_event_at: eventAt })
  if (error) throw new Error(`apply_play_event failed: ${error.message}`)
  return data === true
}
