import { NextRequest } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { checkAndIncrementRate } from '@/lib/redis/rateLimiter'
import { isMockTester, MOCK_REFERENCE, paymentsEnabled } from '@/lib/payments/mock'
import { PRICE_CENTAVOS } from '@/lib/payments/paymongo'
import { grantEntitlement, markProcessed, recordEvent } from '@/lib/payments/store'
import { bearerToken, clientIp, json, preflight } from '@/lib/payments/studentRequest'

export const runtime = 'nodejs'

// POST /api/payments/mock: what the test checkout page (/mock-checkout) calls in place
// of a gateway webhook. Admin accounts only, own account only, real payments off only
// (lib/payments/mock.ts). It runs the same steps as a paid webhook: record the event
// once, grant 'web', mark it processed.
//   {action:'pay', reference}  -> 200 {granted} (a replayed reference grants nothing)
//   {action:'reset'}           -> 200 {reset}: undoes a test grant, never a real one
// Anyone else: 404, as if the route did not exist.

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  if (paymentsEnabled()) return json(req, { error: 'not_found' }, 404)
  const rate = await checkAndIncrementRate(`payments-mock:${clientIp(req)}`, { max: 60, windowSec: 60 * 60 })
  if (!rate.allowed) return json(req, { error: 'rate_limited' }, 429)
  const token = bearerToken(req)
  if (!token) return json(req, { error: 'not_signed_in' }, 401)

  try {
    const db = createServerClient()
    const { data: auth, error: authError } = await db.auth.getUser(token)
    const uid = auth?.user?.id
    if (authError || !uid) return json(req, { error: 'not_signed_in' }, 401)
    if (!(await isMockTester(db, uid))) return json(req, { error: 'not_found' }, 404)

    const body = (await req.json().catch(() => null)) as { action?: unknown; reference?: unknown } | null

    if (body?.action === 'pay') {
      if (typeof body.reference !== 'string' || !MOCK_REFERENCE.test(body.reference)) return json(req, { error: 'bad_request' }, 400)
      // 'web' would replace a Play/grandfather/admin grant, and a reset would then remove it.
      const { data: ent, error: entError } = await db.from('entitlements').select('premium, source').eq('user_id', uid).maybeSingle()
      if (entError) throw new Error(`entitlement lookup failed: ${entError.message}`)
      const current = ent as { premium?: boolean; source?: string } | null
      if (current?.premium && current.source !== 'web') return json(req, { error: 'already_premium' }, 409)
      const id = `mock_${body.reference}`
      const recorded = await recordEvent(db, {
        id, provider: 'mock', user_id: uid, type: 'mock.paid', amount_centavos: PRICE_CENTAVOS,
        payload: { event_id: id, reference_number: body.reference, livemode: false },
      })
      if (recorded === 'duplicate') return json(req, { granted: false, duplicate: true })
      await grantEntitlement(db, uid, 'web')
      await markProcessed(db, id)
      return json(req, { granted: true })
    }

    if (body?.action === 'reset') {
      // A real web purchase also has source 'web': leave the account alone if it has one.
      const { count, error } = await db.from('payment_events').select('id', { count: 'exact', head: true })
        .eq('user_id', uid).neq('provider', 'mock')
      if (error) throw new Error(`payment_events lookup failed: ${error.message}`)
      if (count) return json(req, { error: 'has_real_purchase' }, 409)
      const now = new Date().toISOString()
      const { error: updateError } = await db.from('entitlements')
        .update({ premium: false, revoked_at: now, updated_at: now }).eq('user_id', uid).eq('source', 'web')
      if (updateError) throw new Error(`entitlement reset failed: ${updateError.message}`)
      return json(req, { reset: true })
    }
    return json(req, { error: 'bad_request' }, 400)
  } catch (err) {
    console.error('[payments/mock] failed:', err)
    return json(req, { error: 'server_error' }, 500)
  }
}
