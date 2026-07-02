import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'

export const runtime = 'nodejs'

// POST /api/analytics/dashboard-url
// Body: { url: string }
// Stores (or clears) the PostHog shared-dashboard EMBED URL in app_config so the
// /admin/analytics page can iframe it. Empty string clears it; non-empty must be
// https://. ADMIN-ONLY: middleware only checks a session exists (any signed-in
// app user passes), so the role must be enforced here — this URL is iframed
// into the admin console.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const supabase = gate.supabase

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
