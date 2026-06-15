import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

const REPORT_STATUSES = new Set(['new', 'reviewed', 'resolved'])

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// PATCH /api/admin/app-reports/[id] — body whitelist: { status } only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const status = body?.status
  if (typeof status !== 'string' || !REPORT_STATUSES.has(status)) {
    return NextResponse.json(
      { error: "status must be one of 'new', 'reviewed', 'resolved'" },
      { status: 400 },
    )
  }

  const { error } = await supabase
    .from('app_bug_reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[admin/app-reports/[id] PATCH] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/app-reports/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  const { error } = await supabase
    .from('app_bug_reports')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[admin/app-reports/[id] DELETE] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
