// PayMongo Checkout: request body and webhook event parsing. Pure: no env, no I/O.
// https://docs.paymongo.com/reference/create-a-checkout
// https://docs.paymongo.com/reference/checkout-session-resource

export const PRICE_CENTAVOS = 50000 // PHP 500
export const PRODUCT_NAME = 'Iskotify Full Access'
export const PAYMENT_METHOD_TYPES = ['gcash', 'paymaya', 'card', 'qrph'] as const
export const CHECKOUT_PAID_EVENT = 'checkout_session.payment.paid'

export function buildCheckoutSessionBody(args: { userId: string; webAppUrl: string; referenceNumber: string }) {
  const base = args.webAppUrl.replace(/\/+$/, '')
  return {
    data: {
      attributes: {
        line_items: [{ name: PRODUCT_NAME, amount: PRICE_CENTAVOS, currency: 'PHP', quantity: 1 }],
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
  /** Sum of the session's paid payments, in centavos. */
  amountCentavos: number | null
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
  if (Array.isArray(resAttrs?.payments)) {
    for (const p of resAttrs.payments) {
      const pa = obj(obj(p)?.attributes)
      if (pa?.status === 'paid' && typeof pa.amount === 'number') amount = (amount ?? 0) + pa.amount
    }
  }

  return {
    eventId: data.id,
    type: attrs.type,
    livemode: attrs.livemode === true,
    userId: typeof userId === 'string' ? userId : null,
    sessionId: typeof resource?.id === 'string' ? resource.id : null,
    amountCentavos: amount,
  }
}
