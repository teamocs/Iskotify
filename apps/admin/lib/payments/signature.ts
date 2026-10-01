import { createHash, createHmac, timingSafeEqual } from 'crypto'

// Webhook authentication helpers. Pure: no env, no clock (the caller passes now).

/**
 * Constant-time string compare. Both sides are hashed first so inputs of
 * different lengths still compare in constant time. An empty expected value
 * never matches (an unset secret must fail closed).
 */
export function safeEqual(received: string, expected: string): boolean {
  if (!expected) return false
  const a = createHash('sha256').update(received).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b) && received.length === expected.length
}

export type SignatureResult = { ok: true } | { ok: false; reason: 'missing' | 'malformed' | 'expired' | 'mismatch' }

// How old a signature may be. PayMongo retries a failed delivery up to 12 times
// on an exponential backoff whose intervals it does not publish, and its docs do
// not say whether a retry is re-signed with a fresh `t`. A 5-minute window could
// therefore reject every retry of a paid event. Replays are instead stopped by
// event-id idempotency (payment_events primary key): a replayed body can only
// re-deliver an event already processed, which is a no-op. 3 days bounds how
// long a captured request stays usable at all.
// https://docs.paymongo.com/docs/developer-tools-retry-logic
export const PAYMONGO_MAX_AGE_SEC = 3 * 24 * 60 * 60
/** Clock skew allowed for a timestamp in the future. */
export const PAYMONGO_MAX_SKEW_SEC = 5 * 60

/**
 * Verifies a `Paymongo-Signature` header: `t=<unix seconds>,te=<test sig>,li=<live sig>`.
 * The signature is HMAC-SHA256 (hex) of `${t}.${rawBody}` keyed by the webhook's
 * secret; `li` is checked for live-mode events and `te` for test-mode events.
 * https://docs.paymongo.com/docs/developer-tools-webhook-setup-management
 */
export function verifyPaymongoSignature(args: {
  header: string | null
  rawBody: string
  secret: string
  livemode: boolean
  nowMs: number
}): SignatureResult {
  const { header, rawBody, secret, livemode, nowMs } = args
  if (!header) return { ok: false, reason: 'missing' }

  const parts: Record<string, string> = {}
  for (const piece of header.split(',')) {
    const i = piece.indexOf('=')
    if (i > 0) parts[piece.slice(0, i).trim()] = piece.slice(i + 1).trim()
  }

  const t = parts.t ?? ''
  if (!/^\d+$/.test(t)) return { ok: false, reason: 'malformed' }
  const age = nowMs / 1000 - Number(t)
  if (age > PAYMONGO_MAX_AGE_SEC || age < -PAYMONGO_MAX_SKEW_SEC) return { ok: false, reason: 'expired' }

  const received = (livemode ? parts.li : parts.te) ?? ''
  if (!secret || !received) return { ok: false, reason: 'mismatch' }

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return safeEqual(received.toLowerCase(), expected) ? { ok: true } : { ok: false, reason: 'mismatch' }
}
