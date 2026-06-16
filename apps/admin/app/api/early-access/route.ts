import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

// Basic, deliberately-permissive email check — we only guard against obvious
// garbage; real validation happens when we email the APK.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_LEN = 200

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_LEN) : ''
}

// POST /api/early-access — public early-access APK registration.
// Writes through the service-role client because RLS is enabled with no
// public policies on early_access_registrations.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 })
  }

  const payload = (body ?? {}) as Record<string, unknown>
  const fullName = clean(payload.fullName)
  const email = clean(payload.email).toLowerCase()
  const school = clean(payload.school)
  const gradeLevel = clean(payload.gradeLevel)

  if (!fullName) {
    return NextResponse.json({ ok: false, error: 'Full name is required' }, { status: 400 })
  }
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ ok: false, error: 'A valid email is required' }, { status: 400 })
  }

  let supabase: ReturnType<typeof createServerClient>
  try {
    supabase = createServerClient()
  } catch (err) {
    console.error('[early-access POST] client init failed:', err)
    return NextResponse.json({ ok: false, error: 'Server not configured' }, { status: 500 })
  }

  // The unique index is on lower(email) — an expression index, which PostgREST's
  // onConflict cannot target by name. So we look up an existing row first, then
  // update it (refresh the name/details) or insert a new one. A repeat email
  // therefore succeeds ("already registered") instead of 500-ing on the dupe.
  const { data: existing, error: lookupError } = await supabase
    .from('early_access_registrations')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  if (lookupError) {
    console.error('[early-access POST] lookup error:', lookupError)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from('early_access_registrations')
      .update({
        full_name: fullName,
        school: school || null,
        grade_level: gradeLevel || null,
      })
      .eq('id', existing.id)

    if (updateError) {
      console.error('[early-access POST] update error:', updateError)
      return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  const { error: insertError } = await supabase
    .from('early_access_registrations')
    .insert({
      full_name: fullName,
      email,
      school: school || null,
      grade_level: gradeLevel || null,
      platform: 'android',
      status: 'pending',
    })

  if (insertError) {
    // A race could still hit the unique index between our lookup and insert —
    // treat a duplicate as success rather than an error.
    if (insertError.code === '23505') {
      return NextResponse.json({ ok: true })
    }
    console.error('[early-access POST] insert error:', insertError)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
