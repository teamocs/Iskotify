import { NextRequest, NextResponse } from 'next/server'

// What the student-facing payment routes share: CORS for the web app, the rate-limit
// key and the bearer token.

// The web app calls these cross-origin (app.iskotify.ph -> the admin host), and
// the Authorization header forces a preflight. Native requests send no Origin.
// The Expo web dev server is allowed only outside production.
const PROD_ORIGIN = 'https://app.iskotify.ph'
const DEV_ORIGIN = 'http://localhost:8081'

function corsHeaders(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')
  const allowed = origin === PROD_ORIGIN || (origin === DEV_ORIGIN && process.env.NODE_ENV !== 'production')
  return origin && allowed ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}
}

export function json(req: NextRequest, body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...corsHeaders(req), ...extra } })
}

export function preflight(req: NextRequest) {
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

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

export function bearerToken(req: NextRequest): string | null {
  return /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null
}

export function webAppUrl(): string {
  return (process.env.WEB_APP_URL || 'https://app.iskotify.ph').replace(/\/+$/, '')
}
