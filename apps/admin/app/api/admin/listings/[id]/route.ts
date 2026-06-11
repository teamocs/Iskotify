import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// Explicit allowlist matching POST handler fields + results_date + scholarship_meta + target_courses
const PATCH_ALLOWED = new Set([
  'type',
  'title',
  'slug',
  'provider',
  'description',
  'requirements',
  'coverage',
  'deadline',
  'exam_date',
  'results_date',
  'events',
  'target_courses',
  'target_courses_source',
  'target_year_levels',
  'tags',
  'status',
  'region',
  'grant_amount',
  'external_url',
  'image_url',
  'province',
  'city',
  'scope',
  'is_verified',
  'income_ceiling',
  'gwa_requirement',
  'monthly_stipend',
  'service_obligation_years',
  'has_entrance_exam',
  'application_window',
  'scholarship_meta',
])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const { id } = await params
    const rawBody = await req.json()

    // Strip any fields not on the allowlist (mass-assignment protection)
    const body: Record<string, unknown> = {}
    for (const key of Object.keys(rawBody)) {
      if (PATCH_ALLOWED.has(key)) {
        body[key] = rawBody[key]
      }
    }

    const db = createServerClient()
    const { error } = await db
      .from('listings')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('[admin/listings/[id] PATCH] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('listings')
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[admin/listings/[id] PATCH] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const { id } = await params
    const db = createServerClient()
    const { error } = await db.from('listings').delete().eq('id', id)
    if (error) {
      console.error('[admin/listings/[id] DELETE] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    revalidateTag('listings')
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[admin/listings/[id] DELETE] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
