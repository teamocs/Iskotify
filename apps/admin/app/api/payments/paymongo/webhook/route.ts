import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { CHECKOUT_PAID_EVENT, parsePaymongoEvent } from '@/lib/payments/paymongo'
import { verifyPaymongoSignature } from '@/lib/payments/signature'
import { applyEntitlement, forgetEvent, recordEvent, userExists } from '@/lib/payments/store'
import { grantRevenueCatPromotional } from '@/lib/payments/revenuecat'

export const runtime = 'nodejs'

// POST /api/payments/paymongo/webhook: PayMongo tells us a web checkout was paid.
//
// No session (middleware WEBHOOK_ENDPOINTS). Authenticated by the
// `Paymongo-Signature` header: HMAC-SHA256 of `${t}.${rawBody}` with
// PAYMONGO_WEBHOOK_SECRET, `li` for live events and `te` for test events, and a
// timestamp within 5 minutes. The raw body is read BEFORE parsing so the bytes
// that were signed are the bytes that are checked.
//
// On checkout_session.payment.paid:
//   1. user_id from the session metadata (set by /api/payments/checkout), kept
//      only if it is a uuid of an existing user;
//   2. payment_events insert = idempotency (a replay conflicts -> 200 no-op);
//   3. entitlements premium=true source='web' (a failure forgets the event and
//      answers 500 so PayMongo's retry can grant);
//   4. best effort: a lifetime promotional 'premium' entitlement in RevenueCat,
//      so the Android app sees it. Failure is logged, never a retry.
// Other event types: 200, ignored. Bad signature: 401.
//
// Not gated by PAYMENTS_ENABLED: a payment that did happen is always honoured;
// without PAYMONGO_WEBHOOK_SECRET nothing is accepted.

const NO_STORE = { 'Cache-Control': 'no-store' }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })

export async function POST(req: NextRequest) {
  const secret = process.env.PAYMONGO_WEBHOOK_SECRET
  if (!secret) {
    console.error('[payments/paymongo] PAYMONGO_WEBHOOK_SECRET is not set')
    return json({ error: 'not_configured' }, 500)
  }

  const rawBody = await req.text()
  const header = req.headers.get('paymongo-signature')
  if (!header) return json({ error: 'invalid_signature' }, 401)

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  const event = parsePaymongoEvent(body)
  if (!event) return json({ error: 'bad_request' }, 400)

  const sig = verifyPaymongoSignature({ header, rawBody, secret, livemode: event.livemode, nowMs: Date.now() })
  if (!sig.ok) {
    console.warn('[payments/paymongo] rejected signature:', sig.reason, event.eventId)
    return json({ error: 'invalid_signature' }, 401)
  }

  if (event.type !== CHECKOUT_PAID_EVENT) {
    console.info('[payments/paymongo] ignored event type', event.type, event.eventId)
    return json({ received: true, ignored: true })
  }

  let db: ReturnType<typeof createServerClient>
  try {
    db = createServerClient()
  } catch (err) {
    console.error('[payments/paymongo] client init failed:', err)
    return json({ error: 'not_configured' }, 500)
  }

  let userId: string | null
  try {
    userId = (await userExists(db, event.userId)) ? event.userId!.toLowerCase() : null
  } catch (err) {
    console.error('[payments/paymongo] user lookup failed:', err)
    return json({ error: 'server_error' }, 500)
  }

  try {
    const recorded = await recordEvent(db, {
      id: event.eventId,
      provider: 'paymongo',
      user_id: userId,
      type: event.type,
      amount_centavos: event.amountCentavos,
      payload: body,
    })
    if (recorded === 'duplicate') return json({ received: true, duplicate: true })
  } catch (err) {
    console.error('[payments/paymongo] could not record event:', err)
    return json({ error: 'server_error' }, 500)
  }

  if (!userId) {
    // Paid, but for no account we know (deleted, or tampered metadata). The event
    // is on record for a manual refund; retrying would not help.
    console.error('[payments/paymongo] PAID checkout without a valid user; needs manual review', event.eventId, event.sessionId)
    return json({ received: true, granted: false })
  }

  try {
    await applyEntitlement(db, userId, { kind: 'grant', source: 'web' })
  } catch (err) {
    console.error('[payments/paymongo] grant failed:', err)
    await forgetEvent(db, event.eventId)
    return json({ error: 'server_error' }, 500)
  }

  const rcKey = process.env.REVENUECAT_SECRET_API_KEY
  if (rcKey) {
    const rc = await grantRevenueCatPromotional(userId, rcKey)
    if (!rc.ok) console.error('[payments/paymongo] RevenueCat promotional grant failed', rc.status ?? 'network', userId)
  } else {
    console.warn('[payments/paymongo] REVENUECAT_SECRET_API_KEY not set; RevenueCat not updated', userId)
  }

  return json({ received: true, granted: true })
}
