import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { sendEarlyAccessApkEmail } from '@/lib/email/earlyAccess'

export const runtime = 'nodejs'

// POST /api/early-access/send
// Body: { id: string }
// Reads the permanent APK download URL from app_config, emails it to the
// registrant, then marks the row status='sent'.
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

  // Load the registration row and the stored APK URL in parallel
  const [{ data: row, error: rowError }, { data: configData, error: configError }] = await Promise.all([
    supabase
      .from('early_access_registrations')
      .select('id, email, full_name, status, approved_at')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('app_config')
      .select('value')
      .eq('key', 'early_access_apk_url')
      .maybeSingle(),
  ])

  if (rowError) {
    console.error('[early-access/send POST] row lookup error:', rowError)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  if (!row) {
    return NextResponse.json({ ok: false, error: 'Registration not found' }, { status: 404 })
  }

  if (configError) {
    console.error('[early-access/send POST] app_config lookup error:', configError)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  const downloadUrl = (configData?.value ?? '').trim()

  if (!downloadUrl) {
    return NextResponse.json(
      { ok: false, error: 'No APK link set yet. Add the hosted download URL first.' },
      { status: 400 },
    )
  }

  // Send the email — do NOT change status if email fails
  const emailResult = await sendEarlyAccessApkEmail({
    to: row.email as string,
    name: row.full_name as string | null,
    downloadUrl,
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
