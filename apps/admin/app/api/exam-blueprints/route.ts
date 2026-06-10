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

// GET: list blueprints (+ their sections, notes) and the skill-category options.
export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const [bp, sec, notes, cats] = await Promise.all([
    supabase.from('exam_blueprints').select('*').order('display_order'),
    supabase.from('exam_blueprint_sections').select('*').order('display_order'),
    supabase.from('exam_course_notes').select('*').order('display_order'),
    supabase.from('exam_skill_categories').select('*').order('display_order'),
  ])
  return NextResponse.json({
    blueprints: bp.data ?? [], sections: sec.data ?? [], courseNotes: notes.data ?? [], categories: cats.data ?? [],
  })
}

// PUT: upsert one blueprint and FULLY REPLACE its sections + course notes.
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const body = await req.json()
  const bp = body.blueprint
  if (!bp?.slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  const slug = String(bp.slug).trim()

  const { error: bpErr } = await supabase.from('exam_blueprints').upsert({
    slug, name: bp.name ?? '', acronym: bp.acronym ?? '',
    total_items: Number(bp.total_items) || 0, total_time_minutes: Number(bp.total_time_minutes) || 0,
    has_guessing_penalty: !!bp.has_guessing_penalty, guessing_penalty: Number(bp.guessing_penalty) || 0.25,
    section_blocked: !!bp.section_blocked, scoring_note: bp.scoring_note ?? '', mechanics_note: bp.mechanics_note ?? '',
    status: bp.status === 'published' ? 'published' : 'draft', display_order: Number(bp.display_order) || 0,
  }, { onConflict: 'slug' })
  if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 })

  // Full-replace sections + notes for this slug.
  await supabase.from('exam_blueprint_sections').delete().eq('blueprint_slug', slug)
  await supabase.from('exam_course_notes').delete().eq('blueprint_slug', slug)

  const sections = Array.isArray(body.sections) ? body.sections : []
  if (sections.length) {
    const rows = sections.map((s: any, i: number) => ({
      id: `${slug}:${i + 1}`, blueprint_slug: slug, name: s.name ?? '', skill_category: s.skill_category ?? '',
      item_count: Number(s.item_count) || 0, time_minutes: s.time_minutes != null && s.time_minutes !== '' ? Number(s.time_minutes) : null,
      requires_spatial_logic: !!s.requires_spatial_logic, display_order: i + 1,
    }))
    const { error } = await supabase.from('exam_blueprint_sections').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const notes = Array.isArray(body.courseNotes) ? body.courseNotes : []
  if (notes.length) {
    const rows = notes.map((n: any, i: number) => ({
      id: `${slug}:note:${i + 1}`, blueprint_slug: slug, course_cluster: n.course_cluster ?? 'all',
      note: n.note ?? '', min_percentile: n.min_percentile != null && n.min_percentile !== '' ? Number(n.min_percentile) : null, display_order: i + 1,
    }))
    const { error } = await supabase.from('exam_course_notes').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, slug })
}

// DELETE ?slug=...
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  const { error } = await supabase.from('exam_blueprints').delete().eq('slug', slug) // cascades sections + notes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
