import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { checkAndIncrementRate } from '@/lib/redis/rateLimiter'
import { BUG_SCREENSHOT_BUCKET, bugScreenshotPath } from '@/lib/admin/bugScreenshot'

export const runtime = 'nodejs'

// POST /api/account/delete: the server half of the app's "Delete account".
//
// Auth: `Authorization: Bearer <the student's Supabase access token>`. This path
// is in the middleware's OPERATOR_ENDPOINTS (no admin session) because it proves
// the caller itself: the token is verified with auth.getUser(token) and ONLY the
// id that returns is acted on (nothing in the body is read).
//
// Steps, in this order, each a precondition of the next:
//   1. remove the user's bug-report screenshots through the Storage API (SQL
//      can't: storage.protect_delete blocks it and the bytes would be orphaned).
//      A failure here returns 500 BEFORE any data is touched, so the report rows
//      that point at the files still exist and a retry can finish the job.
//   2. rpc delete_user_data(p_uid): the user's rows (migration 064).
//      A failure keeps the auth user, so the student can sign in and retry.
//   3. auth.admin.deleteUser(uid): the login itself. A failure here leaves no
//      data behind; the error says a retry is safe (every step is idempotent).

const NO_STORE = { 'Cache-Control': 'no-store' }

// The web app calls this cross-origin (app.iskotify.ph -> the admin host), and
// the Authorization header forces a preflight. Native requests send no Origin.
const ALLOWED_ORIGINS = new Set([
  'https://app.iskotify.ph',
  'http://localhost:8081', // Expo web dev server
])

// Deleting is rare and a human retries a few times at most.
// Per IP: generous enough for a school network or carrier NAT shared by
// many students; every call still needs a valid token.
const RATE_MAX = 30
const RATE_WINDOW_SEC = 60 * 60

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
  const rate = await checkAndIncrementRate(`account-delete:${clientIp(req)}`, {
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
  })
  if (!rate.allowed) {
    return json(req, { ok: false, error: 'Too many attempts. Please try again later.' }, 429, rate.retryAfterMs
      ? { 'Retry-After': String(Math.max(1, Math.ceil(rate.retryAfterMs / 1000))) }
      : {})
  }

  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')
  if (!match) return json(req, { ok: false, error: 'Not signed in' }, 401)
  const token = match[1]!

  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[account/delete] client init failed:', err)
    return json(req, { ok: false, error: 'Server not configured' }, 500)
  }

  const { data: auth, error: authError } = await supabase.auth.getUser(token)
  const uid = auth?.user?.id
  if (authError || !uid) return json(req, { ok: false, error: 'Not signed in' }, 401)

  // 1. Screenshot files (paths come from the user's own report rows).
  const { data: reports, error: lookupError } = await supabase
    .from('app_bug_reports')
    .select('image_url')
    .eq('user_id', uid)
  if (lookupError) {
    console.error('[account/delete] report lookup failed:', lookupError)
    return json(req, { ok: false, error: 'We couldn’t delete your account. Nothing was deleted, so you can try again.' }, 500)
  }
  const paths = [...new Set(
    ((reports ?? []) as { image_url: string | null }[])
      .map(r => bugScreenshotPath(r.image_url))
      .filter((p): p is string => !!p),
  )]
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(BUG_SCREENSHOT_BUCKET).remove(paths)
    if (removeError) {
      console.error('[account/delete] screenshot removal failed:', removeError)
      return json(req, { ok: false, error: 'We couldn’t delete your account. Nothing was deleted, so you can try again.' }, 500)
    }
  }

  // 2. Rows.
  const { error: rpcError } = await supabase.rpc('delete_user_data', { p_uid: uid })
  if (rpcError) {
    console.error('[account/delete] delete_user_data failed:', rpcError)
    return json(req, { ok: false, error: 'We couldn’t delete your account. Your sign-in is unchanged, so you can try again.' }, 500)
  }

  // 3. The login.
  const { error: deleteError } = await supabase.auth.admin.deleteUser(uid)
  if (deleteError) {
    console.error('[account/delete] deleteUser failed:', deleteError)
    return json(req, { ok: false, error: 'Your data was deleted but we couldn’t finish removing your sign-in. Please try again; it is safe to repeat.' }, 500)
  }

  return json(req, { ok: true })
}
