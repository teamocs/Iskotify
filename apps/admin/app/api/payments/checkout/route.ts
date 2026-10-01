import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createServerClient } from '@iskotify/utils'
import { checkAndIncrementRate } from '@/lib/redis/rateLimiter'
import { buildCheckoutSessionBody } from '@/lib/payments/paymongo'

export const runtime = 'nodejs'

// POST /api/payments/checkout: starts a web purchase of Iskotify Full Access
// (PHP 500, one time) through PayMongo Checkout (GCash, Maya, cards, QR Ph).
//
// Auth: `Authorization: Bearer <the student's Supabase access token>` (in the
// middleware's BEARER_ENDPOINTS). Only the id auth.getUser(token) returns is
// used; nothing in the body is read. That id rides in the session metadata and
// the PayMongo webhook grants it (migration 067's public.entitlements).
//
// Behind PAYMENTS_ENABLED: anything but 'true' answers 503 payments_disabled.
// Responses: 200 {checkoutUrl} | 401 not_signed_in | 409 already_premium |
//            429 rate_limited | 500 not_configured / lookup_failed |
//            502 checkout_failed | 503 payments_disabled

const NO_STORE = { 'Cache-Control': 'no-store' }

// The web app calls this cross-origin (app.iskotify.ph -> the admin host), and
// the Authorization header forces a preflight. Native requests send no Origin.
const ALLOWED_ORIGINS = new Set([
  'https://app.iskotify.ph',
  'http://localhost:8081', // Expo web dev server
])

// A student opens checkout a handful of times at most. Per IP, generous for a
// school network or carrier NAT; every call still needs a valid token.
const RATE_MAX = 30
const RATE_WINDOW_SEC = 60 * 60

const PAYMONGO_CHECKOUT_URL = 'https://api.paymongo.com/v1/checkout_sessions'

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {}
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

function json(req: NextRequest, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...NO_STORE, ...corsHeaders(req), ...extra } })
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(req),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}

export async function POST(req: NextRequest) {
  if (process.env.PAYMENTS_ENABLED !== 'true') return json(req, { error: 'payments_disabled' }, 503)

  const rate = await checkAndIncrementRate(`payments-checkout:${clientIp(req)}`, {
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
  })
  if (!rate.allowed) {
    return json(req, { error: 'rate_limited' }, 429, rate.retryAfterMs
      ? { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) }
      : {})
  }

  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return json(req, { error: 'not_signed_in' }, 401)
  const token = match[1]!

  const secretKey = process.env.PAYMONGO_SECRET_KEY
  let supabase: ReturnType<typeof createServerClient>
  try {
    if (!secretKey) throw new Error('PAYMONGO_SECRET_KEY is not set')
    supabase = createServerClient()
  } catch (err) {
    console.error('[payments/checkout] not configured:', err)
    return json(req, { error: 'not_configured' }, 500)
  }

  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  const uid = auth?.user?.id
  if (authError || !uid) return json(req, { error: 'not_signed_in' }, 401)

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

  const body = buildCheckoutSessionBody({
    userId: uid,
    webAppUrl: process.env.WEB_APP_URL || 'https://app.iskotify.ph',
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
