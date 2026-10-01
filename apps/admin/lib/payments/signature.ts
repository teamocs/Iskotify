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

/** PayMongo signs `${t}.${rawBody}`; we reject anything older (or newer) than this. */
export const PAYMONGO_TOLERANCE_SEC = 5 * 60

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
  if (Math.abs(nowMs / 1000 - Number(t)) > PAYMONGO_TOLERANCE_SEC) return { ok: false, reason: 'expired' }

  const received = (livemode ? parts.li : parts.te) ?? ''
  if (!secret || !received) return { ok: false, reason: 'mismatch' }

  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')
  return safeEqual(received.toLowerCase(), expected) ? { ok: true } : { ok: false, reason: 'mismatch' }
}
