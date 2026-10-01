// PayMongo Checkout: request body, webhook event parsing and the checks a paid
// session must pass before it unlocks anything. Pure: no env, no I/O.
// https://docs.paymongo.com/reference/create-a-checkout
// https://docs.paymongo.com/reference/checkout-session-resource

export const PRICE_CENTAVOS = 50000 // PHP 500
export const CURRENCY = 'PHP'
export const PRODUCT_NAME = 'Iskotify Full Access'
export const PAYMENT_METHOD_TYPES = ['gcash', 'paymaya', 'card', 'qrph'] as const
export const CHECKOUT_PAID_EVENT = 'checkout_session.payment.paid'
/** Every session /api/payments/checkout creates has a reference number with this prefix. */
export const REFERENCE_PREFIX = 'ISK-'

export function buildCheckoutSessionBody(args: { userId: string; webAppUrl: string; referenceNumber: string }) {
  const base = args.webAppUrl.replace(/\/+$/, '')
  return {
    data: {
      attributes: {
        line_items: [{ name: PRODUCT_NAME, amount: PRICE_CENTAVOS, currency: CURRENCY, quantity: 1 }],
        payment_method_types: [...PAYMENT_METHOD_TYPES],
        success_url: `${base}/upgrade?status=success`,
        cancel_url: `${base}/upgrade?status=cancelled`,
        metadata: { user_id: args.userId },
        reference_number: args.referenceNumber,
      },
    },
  }
}

export type PaymongoEvent = {
  eventId: string
  type: string
  livemode: boolean
  /** metadata.user_id of the checkout session, unvalidated. */
  userId: string | null
  sessionId: string | null
  referenceNumber: string | null
  /** Ids of the session's paid payments. */
  paymentIds: string[]
  /** Sum of the session's paid payments, in centavos. */
  amountCentavos: number | null
  /** The paid payments' currency, or null when absent or mixed. */
  currency: string | null
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null

/** Reads a webhook event `{ data: { id, attributes: { type, livemode, data } } }`, or null if it is not one. */
export function parsePaymongoEvent(body: unknown): PaymongoEvent | null {
  const data = obj(obj(body)?.data)
  const attrs = obj(data?.attributes)
  if (!data || !attrs || typeof data.id !== 'string' || !data.id || typeof attrs.type !== 'string') return null

  const resource = obj(attrs.data)
  const resAttrs = obj(resource?.attributes)
  const userId = obj(resAttrs?.metadata)?.user_id

  let amount: number | null = null
  const paymentIds: string[] = []
  const currencies = new Set<unknown>()
  if (Array.isArray(resAttrs?.payments)) {
    for (const p of resAttrs.payments) {
      const pa = obj(obj(p)?.attributes)
      if (pa?.status !== 'paid' || typeof pa.amount !== 'number') continue
      amount = (amount ?? 0) + pa.amount
      currencies.add(pa.currency)
      const id = obj(p)?.id
      if (typeof id === 'string') paymentIds.push(id)
    }
  }
  const [only] = currencies

  return {
    eventId: data.id,
    type: attrs.type,
    livemode: attrs.livemode === true,
    userId: typeof userId === 'string' ? userId : null,
    sessionId: typeof resource?.id === 'string' ? resource.id : null,
    referenceNumber: typeof resAttrs?.reference_number === 'string' ? resAttrs.reference_number : null,
    paymentIds,
    amountCentavos: amount,
    currency: currencies.size === 1 && typeof only === 'string' ? only : null,
  }
}

/** The mode a secret key works in: sk_live_ => true, sk_test_ => false, anything else => null. */
export function expectedLivemode(secretKey: string | undefined): boolean | null {
  if (secretKey?.startsWith('sk_live_')) return true
  if (secretKey?.startsWith('sk_test_')) return false
  return null
}

/**
 * A paid session unlocks Full Access only if it is exactly what our checkout
 * sells: PHP 500, our reference prefix, and the same mode as our secret key.
 */
export function checkPaidCheckout(ev: PaymongoEvent, livemode: boolean): { ok: true } | { ok: false; reason: string } {
  if (ev.livemode !== livemode) return { ok: false, reason: `livemode ${ev.livemode} does not match the key` }
  if (ev.amountCentavos !== PRICE_CENTAVOS) return { ok: false, reason: `amount ${ev.amountCentavos} is not ${PRICE_CENTAVOS}` }
  if (ev.currency !== CURRENCY) return { ok: false, reason: `currency ${ev.currency} is not ${CURRENCY}` }
  if (!ev.referenceNumber?.startsWith(REFERENCE_PREFIX)) return { ok: false, reason: 'reference number is not ours' }
  return { ok: true }
}

/** The purchase facts kept in payment_events.payload: never metadata, billing or the user id. */
export function minimalPaymongoPayload(ev: PaymongoEvent) {
  return {
    event_id: ev.eventId,
    type: ev.type,
    livemode: ev.livemode,
    session_id: ev.sessionId,
    reference_number: ev.referenceNumber,
    payment_ids: ev.paymentIds,
    amount_centavos: ev.amountCentavos,
    currency: ev.currency,
  }
}
