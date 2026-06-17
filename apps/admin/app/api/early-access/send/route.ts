import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { sendEarlyAccessApkEmail } from '@/lib/email/earlyAccess'

export const runtime = 'nodejs'

// POST /api/early-access/send
// Body: { id: string }
// Generates a 48h signed download URL for the APK from Supabase Storage,
// emails it to the registrant, then marks the row status='sent'.
// All Supabase and Resend access is server-side only — no secrets reach the client.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const id = typeof (body as Record<string, unknown>).id === 'string'
    ? ((body as Record<string, unknown>).id as string).trim()
    : ''

  if (!id) {
    return NextResponse.json({ ok: false, error: 'id is required' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[early-access/send POST] client init failed:', err)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
  }

  // Load the registration row
  const { data: row, error: rowError } = await supabase
    .from('early_access_registrations')
    .select('id, email, full_name, status, approved_at')
    .eq('id', id)
    .maybeSingle()

  if (rowError) {
    console.error('[early-access/send POST] row lookup error:', rowError)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  if (!row) {
    return NextResponse.json({ ok: false, error: 'Registration not found' }, { status: 404 })
  }

  // Generate a 48-hour signed download URL from the private bucket
  const objectKey = process.env.EARLY_ACCESS_APK_OBJECT ?? 'iskotify-early-access.apk'
  const EXPIRES_SECONDS = 48 * 60 * 60

  const { data: signedData, error: signError } = await supabase.storage
    .from('early-access-apk')
    .createSignedUrl(objectKey, EXPIRES_SECONDS)

  if (signError || !signedData?.signedUrl) {
    console.error('[early-access/send POST] createSignedUrl error:', signError)
    return NextResponse.json(
      {
        ok: false,
        error: 'No APK uploaded yet. Upload it to the early-access-apk bucket first.',
      },
      { status: 400 },
    )
  }

  // Send the email — do NOT change status if email fails
  const emailResult = await sendEarlyAccessApkEmail({
    to: row.email as string,
    name: row.full_name as string | null,
    downloadUrl: signedData.signedUrl,
    expiresHours: 48,
  })

  if (!emailResult.ok) {
    console.error('[early-access/send POST] email send failed:', emailResult.error)
    return NextResponse.json({ ok: false, error: emailResult.error }, { status: 502 })
  }

  // Email sent — update status to 'sent'; also backfill approved_at if not set
  const { error: updateError } = await supabase
    .from('early_access_registrations')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      approved_at: row.approved_at ?? new Date().toISOString(),
    })
    .eq('id', id)

  if (updateError) {
    // Email was sent — log but don't fail the response; admin can re-send if needed
    console.error('[early-access/send POST] status update error (email already sent):', updateError)
  }

  return NextResponse.json({ ok: true })
}
