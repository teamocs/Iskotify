import { NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

// POST /api/early-access/apk-upload-url
// Mints a one-time signed upload URL so the browser can push the APK
// directly to Supabase Storage — no file bytes flow through this server.
// The service-role key is NEVER sent to the client; only the short-lived
// signed upload token is returned.
export async function POST() {
  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[apk-upload-url POST] client init failed:', err)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
  }

  const objectKey = process.env.EARLY_ACCESS_APK_OBJECT ?? 'iskotify-early-access.apk'

  // createSignedUploadUrl with upsert:true sends the x-upsert header so that
  // uploading to the same path overwrites (rather than errors on) an existing object.
  // This is confirmed available in @supabase/storage-js 2.x bundled with supabase-js 2.105.x.
  const { data, error } = await supabase.storage
    .from('early-access-apk')
    .createSignedUploadUrl(objectKey, { upsert: true })

  if (error || !data) {
    console.error('[apk-upload-url POST] createSignedUploadUrl error:', error)
    return NextResponse.json(
      { ok: false, error: 'Could not create signed upload URL' },
      { status: 500 },
    )
  }

  // data shape from storage-js: { path, token, signedUrl }
  return NextResponse.json({
    ok: true,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    objectKey,
  })
}
