import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { classifyRevenueCatEvent, minimalRevenueCatPayload, type RevenueCatDecision } from '@/lib/payments/entitlementRules'
import { safeEqual } from '@/lib/payments/signature'
import { forgetEvent, grantEntitlement, recordEvent, revokePlayEntitlement, userExists } from '@/lib/payments/store'

export const runtime = 'nodejs'

// POST /api/payments/revenuecat/webhook: RevenueCat reports Google Play purchases.
//
// No session (middleware WEBHOOK_ENDPOINTS). Authenticated by the Authorization
// header, compared in constant time with REVENUECAT_WEBHOOK_AUTH (the value set
// in RevenueCat's webhook settings). Body: { api_version, event: {...} }.
// https://www.revenuecat.com/docs/integrations/webhooks
//
//   INITIAL_PURCHASE / NON_RENEWING_PURCHASE with 'premium' -> grant 'play'
//   CANCELLATION (CUSTOMER_SUPPORT = refund) / EXPIRATION   -> revoke, ONLY a 'play' grant
//   TRANSFER -> revoke the senders' 'play' grants, grant the (existing) receivers
//               'play'; otherwise a restore onto a second account followed by a
//               refund would leave the first account premium for free
//   anonymous ids ($RCAnonymousID:...), unknown users, other types -> 200, logged
//   non-PRODUCTION events -> ignored unless REVENUECAT_ALLOW_SANDBOX === 'true'
// Every verified event is recorded in payment_events as a MINIMAL record (no user
// ids, aliases or subscriber attributes); event.id is the idempotency key. A
// failed write forgets the event and answers 500 so RevenueCat retries; every
// write is idempotent, so a retry may safely repeat a partly applied transfer.
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

  let decision: RevenueCatDecision = classifyRevenueCatEvent(event, {
    allowSandbox: process.env.REVENUECAT_ALLOW_SANDBOX === 'true',
  })
  try {
    if (decision.kind === 'grant' || decision.kind === 'revoke') {
      if (!(await userExists(db, decision.userId))) decision = { kind: 'ignore', reason: 'no such user' }
    } else if (decision.kind === 'transfer') {
      // Senders are revoked by id (a no-op for a missing row); receivers must exist.
      const grantTo: string[] = []
      for (const id of decision.grantTo) if (await userExists(db, id)) grantTo.push(id)
      decision = { ...decision, grantTo }
    }
  } catch (err) {
    console.error('[payments/revenuecat] user lookup failed:', err)
    return json({ error: 'server_error' }, 500)
  }

  const linkedUser =
    decision.kind === 'grant' || decision.kind === 'revoke' ? decision.userId
    : decision.kind === 'transfer' ? decision.grantTo[0] ?? null
    : null

  try {
    const recorded = await recordEvent(db, {
      id: eventId,
      provider: 'revenuecat',
      user_id: linkedUser,
      type,
      amount_centavos: amountCentavos(event),
      payload: minimalRevenueCatPayload(event),
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
    if (decision.kind === 'grant') {
      const written = await grantEntitlement(db, decision.userId, 'play')
      console.info('[payments/revenuecat]', type, eventId, 'grant', written ? 'written' : 'unchanged')
    } else if (decision.kind === 'revoke') {
      const written = await revokePlayEntitlement(db, decision.userId)
      console.info('[payments/revenuecat]', type, eventId, 'revoke', written ? 'written' : 'unchanged')
    } else {
      for (const id of decision.revokeFrom) await revokePlayEntitlement(db, id)
      for (const id of decision.grantTo) await grantEntitlement(db, id, 'play')
      console.info('[payments/revenuecat] TRANSFER', eventId, `revoked ${decision.revokeFrom.length}, granted ${decision.grantTo.length}`)
    }
  } catch (err) {
    console.error('[payments/revenuecat] entitlement write failed:', err)
    await forgetEvent(db, eventId)
    return json({ error: 'server_error' }, 500)
  }

  return json({ received: true })
}
