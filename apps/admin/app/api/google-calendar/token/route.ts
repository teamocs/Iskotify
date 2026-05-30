import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export async function POST(req: NextRequest) {
  // 1. Verify the caller's Supabase JWT against the auth server (NOT a local decode).
  const authHeader = req.headers.get('authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }
  const jwt = authHeader.slice(7)

  const supabase = createServerClient()
  const { data: { user }, error: userErr } = await supabase.auth.getUser(jwt)
  if (userErr || !user) {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
  }

  // 2. Read the stored refresh token (service-role bypasses RLS).
  const { data: row } = await supabase
    .from('google_calendar_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .single()
  if (!row?.refresh_token) {
    return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 404 })
  }

  // 3. Exchange refresh token for a fresh access token.
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 500 })
  }

  const googleRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
      grant_type: 'refresh_token',
    }).toString(),
  })

  if (!googleRes.ok) {
    const body = await googleRes.json().catch(() => ({}))
    if (body?.error === 'invalid_grant') {
      return NextResponse.json({ error: 'invalid_grant' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Google token exchange failed' }, { status: 502 })
  }

  const tok = await googleRes.json() as { access_token: string; expires_in: number }
  return NextResponse.json({ access_token: tok.access_token, expires_in: tok.expires_in })
}
