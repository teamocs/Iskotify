import type { createServerClient } from '@iskotify/utils'
import { isUuid, planGrant, planRevoke, type EntitlementRow, type EntitlementSource } from './entitlementRules'

// Database side of the payment webhooks (migration 067), over the service-role
// client. Every function throws on a database error so the route can answer 500
// and let the provider retry.

type Db = ReturnType<typeof createServerClient>

export type PaymentEvent = {
  id: string
  provider: 'paymongo' | 'revenuecat'
  user_id: string | null
  type: string
  amount_centavos: number | null
  payload: unknown
}

/** Inserts the event; 'duplicate' when its id was already recorded (a replay). */
export async function recordEvent(db: Db, event: PaymentEvent): Promise<'recorded' | 'duplicate'> {
  const { error } = await db.from('payment_events').insert(event)
  if (!error) return 'recorded'
  if (error.code === '23505') return 'duplicate'
  throw new Error(`payment_events insert failed: ${error.message}`)
}

/** Removes a recorded event after its processing failed, so the provider's retry is not a no-op. */
export async function forgetEvent(db: Db, id: string): Promise<void> {
  const { error } = await db.from('payment_events').delete().eq('id', id)
  if (error) console.error('[payments] could not forget event', id, error.message)
}

/** True when `id` is a uuid of an existing auth user. */
export async function userExists(db: Db, id: unknown): Promise<boolean> {
  if (!isUuid(id)) return false
  const { data, error } = await db.auth.admin.getUserById(id)
  if (data?.user) return true
  if (error && (error as { status?: number }).status !== 404) throw new Error(`user lookup failed: ${error.message}`)
  return false
}

async function readEntitlement(db: Db, userId: string): Promise<EntitlementRow | null> {
  const { data, error } = await db
    .from('entitlements')
    .select('premium, source, granted_at, revoked_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`entitlements read failed: ${error.message}`)
  return (data as EntitlementRow | null) ?? null
}

/**
 * Applies a grant or revoke per entitlementRules. Returns whether a row was
 * written ('unchanged' when the rules say leave it alone).
 */
export async function applyEntitlement(
  db: Db,
  userId: string,
  action: { kind: 'grant'; source: EntitlementSource } | { kind: 'revoke' },
  now = new Date(),
): Promise<'written' | 'unchanged'> {
  const current = await readEntitlement(db, userId)
  const iso = now.toISOString()
  const next = action.kind === 'grant' ? planGrant(current, action.source, iso) : planRevoke(current, iso)
  if (!next) return 'unchanged'
  const { error } = await db
    .from('entitlements')
    .upsert({ user_id: userId, ...next, updated_at: iso }, { onConflict: 'user_id' })
  if (error) throw new Error(`entitlements upsert failed: ${error.message}`)
  return 'written'
}
