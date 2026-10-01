import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { classifyRevenueCatEvent, type RevenueCatDecision } from '@/lib/payments/entitlementRules'
import { safeEqual } from '@/lib/payments/signature'
import { applyEntitlement, forgetEvent, recordEvent, userExists } from '@/lib/payments/store'

export const runtime = 'nodejs'

// POST /api/payments/revenuecat/webhook: RevenueCat reports Google Play purchases.
//
// No session (middleware WEBHOOK_ENDPOINTS). Authenticated by the Authorization
// header, compared in constant time with REVENUECAT_WEBHOOK_AUTH (the value set
// in RevenueCat's webhook settings). Body: { api_version, event: {...} }.
// https://www.revenuecat.com/docs/integrations/webhooks
//
//   INITIAL_PURCHASE / NON_RENEWING_PURCHASE with 'premium' -> premium, source 'play'
//   CANCELLATION (CUSTOMER_SUPPORT = refund) / EXPIRATION   -> revoke, ONLY a 'play' grant
//   anonymous ids ($RCAnonymousID:...), unknown users, TRANSFER, other types
//                                                           -> 200, logged, no change
// Every verified event is recorded in payment_events (the idempotency key is
// event.id). A failed write forgets the event and answers 500 so RevenueCat retries.
//
// Not gated by PAYMENTS_ENABLED: a purchase that did happen is always honoured;
// without REVENUECAT_WEBHOOK_AUTH nothing is accepted.

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

function amountCentavos(e: Record<string, unknown>): number | null {
  const v = e.price_in_purchased_currency
  return e.currency === 'PHP' && typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) : null
}

export async function POST(req: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH
  if (!expected) {
    console.error('[payments/revenuecat] REVENUECAT_WEBHOOK_AUTH is not set')
    return json({ error: 'not_configured' }, 500)
  }
  if (!safeEqual(req.headers.get('authorization') ?? '', expected)) return json({ error: 'unauthorized' }, 401)

  let body: { event?: Record<string, unknown> }
  try {
    body = JSON.parse(await req.text())
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const event = body && typeof body.event === 'object' && body.event ? body.event : null
  const eventId = event && typeof event.id === 'string' && event.id ? event.id : null
  if (!event || !eventId) return json({ error: 'bad_request' }, 400)
  const type = typeof event.type === 'string' ? event.type : 'UNKNOWN'

  let db: ReturnType<typeof createServerClient>
  try {
    db = createServerClient()
  } catch (err) {
    console.error('[payments/revenuecat] client init failed:', err)
    return json({ error: 'not_configured' }, 500)
  }

  let decision: RevenueCatDecision = classifyRevenueCatEvent(event)
  if (decision.kind !== 'ignore') {
    try {
      if (!(await userExists(db, decision.userId))) decision = { kind: 'ignore', reason: 'no such user' }
    } catch (err) {
      console.error('[payments/revenuecat] user lookup failed:', err)
      return json({ error: 'server_error' }, 500)
    }
  }

  try {
    const recorded = await recordEvent(db, {
      id: eventId,
      provider: 'revenuecat',
      user_id: decision.kind === 'ignore' ? null : decision.userId,
      type,
      amount_centavos: amountCentavos(event),
      payload: body,
    })
    if (recorded === 'duplicate') return json({ received: true, duplicate: true })
  } catch (err) {
    console.error('[payments/revenuecat] could not record event:', err)
    return json({ error: 'server_error' }, 500)
  }

  if (decision.kind === 'ignore') {
    console.warn('[payments/revenuecat] ignored', type, eventId, decision.reason)
    return json({ received: true, ignored: true })
  }

  try {
    const action = decision.kind === 'grant' ? { kind: 'grant' as const, source: 'play' as const } : { kind: 'revoke' as const }
    const result = await applyEntitlement(db, decision.userId, action)
    console.info('[payments/revenuecat]', type, eventId, decision.kind, result)
  } catch (err) {
    console.error('[payments/revenuecat] entitlement write failed:', err)
    await forgetEvent(db, eventId)
    return json({ error: 'server_error' }, 500)
  }

  return json({ received: true })
}
