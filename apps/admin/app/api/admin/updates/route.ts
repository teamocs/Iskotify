import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// GET: list admissions updates, newest first, limit 100
export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const { data, error } = await supabase
    .from('admissions_updates')
    .select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at')
    .order('report_date', { ascending: false })
    .limit(100)
  if (error) {
    console.error('[admin/updates GET] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

// POST: create a new admissions update
export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const body = await req.json()
  if (!body.title || !body.body || !body.report_date || !body.severity) {
    return NextResponse.json({ error: 'title, body, report_date, and severity are required' }, { status: 400 })
  }
  // id is text PRIMARY KEY — generate a uuid-based id
  const id = body.id || crypto.randomUUID()
  const row = {
    id,
    report_date: body.report_date,
    severity: body.severity,
    school_slug: body.school_slug ?? null,
    school_name: body.school_name ?? null,
    title: body.title,
    body: body.body,
    action_required: body.action_required ?? null,
    event_date: body.event_date ?? null,
    event_type: body.event_type ?? null,
    sources: Array.isArray(body.sources) ? body.sources : [],
    verified: !!body.verified,
  }
  const { error } = await supabase.from('admissions_updates').insert(row)
  if (error) {
    console.error('[admin/updates POST] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id }, { status: 201 })
}

// PATCH: update an existing admissions update by id (in body)
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const body = await req.json()
  const id = body?.id as string | undefined
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  const { id: _id, ...rest } = body
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  }
  const allowed = ['report_date', 'severity', 'school_slug', 'school_name', 'title', 'body',
    'action_required', 'event_date', 'event_type', 'sources', 'verified']
  for (const key of allowed) {
    if (key in rest) update[key] = rest[key]
  }
  const { error } = await supabase.from('admissions_updates').update(update).eq('id', id)
  if (error) {
    console.error('[admin/updates PATCH] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

// DELETE: remove admissions update by ?id=
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param is required' }, { status: 400 })
  }
  const { error } = await supabase.from('admissions_updates').delete().eq('id', id)
  if (error) {
    console.error('[admin/updates DELETE] supabase error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
