import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

// POST /api/early-access/apk-url
// Body: { url: string }
// Stores (or clears) the hosted APK download URL in app_config so "Send APK"
// emails use it. An empty string clears the link. Non-empty must be https://.
// All Supabase access is server-side only — no secrets reach the client.
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

  // Allow empty string to CLEAR the link; non-empty must be https://
  if (url !== '' && !url.startsWith('https://')) {
    return NextResponse.json(
      { ok: false, error: 'URL must start with https://' },
      { status: 400 },
    )
  }

  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[apk-url POST] client init failed:', err)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
  }

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'early_access_apk_url', value: url, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[apk-url POST] upsert error:', error)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
