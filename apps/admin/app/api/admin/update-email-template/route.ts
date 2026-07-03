import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'

export const runtime = 'nodejs'

const MAX_TEMPLATE_LENGTH = 20000

// POST /api/admin/update-email-template
// Body: { template: string }
// Stores the editable "App update — for existing users" email body in
// app_config under update_email_template. Any string (incl. empty) is allowed
// up to ~20000 chars.
// ADMIN-ONLY: middleware only checks a session exists, so this route must
// enforce the role itself.
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

  const raw = (body as Record<string, unknown>).template

  if (typeof raw !== 'string') {
    return NextResponse.json({ ok: false, error: '"template" must be a string' }, { status: 400 })
  }

  if (raw.length > MAX_TEMPLATE_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Template must be ${MAX_TEMPLATE_LENGTH} characters or fewer` },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('app_config')
    .upsert(
      { key: 'update_email_template', value: raw, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    )

  if (error) {
    console.error('[update-email-template POST] upsert error:', error)
    return NextResponse.json({ ok: false, error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
