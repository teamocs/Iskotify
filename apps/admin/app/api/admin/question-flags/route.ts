import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/requireAdmin'
import { createAuthClient } from '@/lib/supabase'
import { parseDismissalInput } from '@/lib/admin/reviewQueue'

export const runtime = 'nodejs'

// Shared dismissals for the Distractor Review Queue (/admin/upcat/review-queue).
// Table: question_flag_dismissals (migration 059), service role only (RLS on,
// no client policies). A dismissal is keyed by (question_id, options_fingerprint),
// so editing a question's options brings its flag back.
const TABLE = 'question_flag_dismissals'

async function readJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    return { ok: true, body: await req.json() }
  } catch {
    return { ok: false }
  }
}

// POST /api/admin/question-flags  { question_id, options_fingerprint }
// Dismisses the flag for everyone. Idempotent (upsert on the primary key).
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const json = await readJson(req)
  if (!json.ok) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const parsed = parseDismissalInput(json.body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  // requireAdmin verified an admin session; read the user again for attribution.
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()

  const { error } = await supabase.from(TABLE).upsert(
    { ...parsed.value, dismissed_by: user?.id ?? null, dismissed_at: new Date().toISOString() },
    { onConflict: 'question_id,options_fingerprint' },
  )
  if (error) {
    console.error('[question-flags POST] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/question-flags?question_id=&options_fingerprint=
// (or the same keys as a JSON body). Restores the flag for everyone.
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const params = req.nextUrl.searchParams
  let input: unknown
  if (params.has('question_id') || params.has('options_fingerprint')) {
    input = { question_id: params.get('question_id'), options_fingerprint: params.get('options_fingerprint') }
  } else {
    const json = await readJson(req)
    if (!json.ok) return NextResponse.json({ error: 'Pass question_id and options_fingerprint' }, { status: 400 })
    input = json.body
  }
  const parsed = parseDismissalInput(input)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('question_id', parsed.value.question_id)
    .eq('options_fingerprint', parsed.value.options_fingerprint)
  if (error) {
    console.error('[question-flags DELETE] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
