import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

// POST /api/analytics/dashboard-url
// Body: { url: string }
// Stores (or clears) the PostHog shared-dashboard EMBED URL in app_config so the
// /admin/analytics page can iframe it. Empty string clears it; non-empty must be
// https://. Session-gated by middleware (/api/:path*) — admin-only. All Supabase
// access is server-side (service role); no secrets reach the client.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const raw = (body as Record<string, unknown>).url
  const url = typeof raw === 'string' ? raw.trim() : null

  if (url === null) {
    return NextResponse.json({ ok: false, error: '"url" must be a string' }, { status: 400 })
  }
  if (url !== '' && !url.startsWith('https://')) {
    return NextResponse.json({ ok: false, error: 'URL must start with https://' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[analytics dashboard-url POST] client init failed:', err)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
  }

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'posthog_dashboard_url', value: url, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[analytics dashboard-url POST] upsert error:', error)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
