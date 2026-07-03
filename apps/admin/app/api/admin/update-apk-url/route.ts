import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'

export const runtime = 'nodejs'

// POST /api/admin/update-apk-url
// Body: { url: string }
// Stores (or clears) the hosted UPDATE APK download URL in app_config so the
// "App update — for existing users" email can point at it. An empty string
// clears the link. Non-empty must be https://. Distinct from the first-install
// early-access APK (early_access_apk_url).
// ADMIN-ONLY: middleware only checks a session exists, so this route must
// enforce the role itself — this URL is handed to installed users as "the
// update to install"; without the gate any signed-in user could poison it.
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

  // Allow empty string to CLEAR the link; non-empty must be https://
  if (url !== '' && !url.startsWith('https://')) {
    return NextResponse.json(
      { ok: false, error: 'URL must start with https://' },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'update_apk_url', value: url, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[update-apk-url POST] upsert error:', error)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
