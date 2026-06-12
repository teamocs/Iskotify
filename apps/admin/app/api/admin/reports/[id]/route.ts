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

// GET /api/admin/reports/[id]
// Returns { report, question } — question is the live row from the source
// table (flashcards or upcat_questions), or null if it no longer exists.
// The reports page uses this to prefill the inline question editor.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  const { data: report, error } = await supabase
    .from('question_reports')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !report) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 })
  }

  // source_table is constrained by a DB CHECK to these two values; guard anyway.
  const sourceTable = report.source_table === 'upcat_questions' ? 'upcat_questions' : 'flashcards'
  const pkColumn = sourceTable === 'upcat_questions' ? 'question_id' : 'id'

  const { data: question, error: qError } = await supabase
    .from(sourceTable)
    .select('*')
    .eq(pkColumn, report.question_id)
    .maybeSingle()

  if (qError) {
    console.error('[admin/reports/[id] GET] question fetch error:', qError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ report, question: question ?? null })
}

// PATCH /api/admin/reports/[id] — body whitelist: { status } only
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
    .from('question_reports')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[admin/reports/[id] PATCH] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/reports/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const { id } = await params

  const { error } = await supabase
    .from('question_reports')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[admin/reports/[id] DELETE] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
