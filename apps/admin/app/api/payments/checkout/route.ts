import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@iskotify/utils'
import { checkAndIncrementRate } from '@/lib/redis/rateLimiter'
import { buildCheckoutSessionBody } from '@/lib/payments/paymongo'
import { isMockTester, newMockReference, paymentsEnabled } from '@/lib/payments/mock'
import { bearerToken, clientIp, json, preflight, webAppUrl } from '@/lib/payments/studentRequest'

export const runtime = 'nodejs'

// POST /api/payments/checkout: starts a web purchase of Iskotify Full Access
// (PHP 500, one time) through PayMongo Checkout (GCash, Maya, cards, QR Ph).
//
// Auth: `Authorization: Bearer <the student's Supabase access token>` (in the
// middleware's BEARER_ENDPOINTS). Only the id auth.getUser(token) returns is
// used; nothing in the body is read. That id rides in the session metadata and
// the PayMongo webhook grants it (migration 067's public.entitlements).
//
// Behind PAYMENTS_ENABLED: anything but 'true' answers 503 payments_disabled, except
// for an admin account, which gets the test checkout page (lib/payments/mock.ts).
// Responses: 200 {checkoutUrl} | 401 not_signed_in | 409 already_premium |
//            429 rate_limited | 500 not_configured / lookup_failed |
//            502 checkout_failed | 503 payments_disabled

// A student opens checkout a handful of times at most. Per IP, generous for a
// school network or carrier NAT; every call still needs a valid token.
const RATE_MAX = 30
const RATE_WINDOW_SEC = 60 * 60

const PAYMONGO_CHECKOUT_URL = 'https://api.paymongo.com/v1/checkout_sessions'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const rate = await checkAndIncrementRate(`payments-checkout:${clientIp(req)}`, {
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
  })
  if (!rate.allowed) {
    return json(req, { error: 'rate_limited' }, 429, rate.retryAfterMs
      ? { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) }
      : {})
  }

  const mock = !paymentsEnabled()
  const notSignedIn = () => (mock ? json(req, { error: 'payments_disabled' }, 503) : json(req, { error: 'not_signed_in' }, 401))
  const token = bearerToken(req)
  if (!token) return notSignedIn()

  const secretKey = process.env.PAYMONGO_SECRET_KEY
  let supabase: ReturnType<typeof createServerClient>
  try {
    if (!mock && !secretKey) throw new Error('PAYMONGO_SECRET_KEY is not set')
    supabase = createServerClient()
  } catch (err) {
    console.error('[payments/checkout] not configured:', err)
    return json(req, { error: 'not_configured' }, 500)
  }

  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  const uid = auth?.user?.id
  if (authError || !uid) return notSignedIn()
  if (mock) {
    try {
      if (!(await isMockTester(supabase, uid))) return json(req, { error: 'payments_disabled' }, 503)
    } catch (err) {
      console.error('[payments/checkout] tester lookup failed:', err)
      return json(req, { error: 'payments_disabled' }, 503)
    }
  }

  const { data: ent, error: entError } = await supabase
    .from('entitlements')
    .select('premium')
    .eq('user_id', uid)
    .maybeSingle()
  if (entError) {
    console.error('[payments/checkout] entitlement lookup failed:', entError)
    return json(req, { error: 'lookup_failed' }, 500)
  }
  if ((ent as { premium?: boolean } | null)?.premium) return json(req, { error: 'already_premium' }, 409)

  if (mock) return json(req, { checkoutUrl: `${webAppUrl()}/mock-checkout?reference=${newMockReference()}` })

  const body = buildCheckoutSessionBody({
    userId: uid,
    webAppUrl: webAppUrl(),
    referenceNumber: `ISK-${Date.now().toString(36)}-${randomBytes(6).toString('hex')}`,
  })

  let checkoutUrl: unknown
  try {
    const res = await fetch(PAYMONGO_CHECKOUT_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[payments/checkout] PayMongo responded', res.status, (await res.text()).slice(0, 500))
      return json(req, { error: 'checkout_failed' }, 502)
    }
    const created = (await res.json()) as { data?: { attributes?: { checkout_url?: unknown } } }
    checkoutUrl = created?.data?.attributes?.checkout_url
  } catch (err) {
    console.error('[payments/checkout] PayMongo request failed:', err)
    return json(req, { error: 'checkout_failed' }, 502)
  }

  if (typeof checkoutUrl !== 'string' || !checkoutUrl.startsWith('https://')) {
    console.error('[payments/checkout] PayMongo returned no usable checkout_url')
    return json(req, { error: 'checkout_failed' }, 502)
  }
  return json(req, { checkoutUrl })
}
