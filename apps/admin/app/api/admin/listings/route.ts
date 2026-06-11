import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createServerClient } from '@iskotify/utils'

const REQUIRED = ['type', 'title', 'slug', 'provider', 'status', 'region'] as const

const fetchListings = unstable_cache(
  async () => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('listings')
      .select('slug, title, status')
      .in('status', ['active', 'upcoming'])
      .order('title')
    if (error) throw error
    return data ?? []
  },
  ['admin-listings'],
  { tags: ['listings'], revalidate: 300 },
)

export async function GET() {
  try {
    const data = await fetchListings()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Database error' }, { status: 500 })
  }
}

// Edit a listing's course-field tags (admin-gated via middleware). Sets source='manual'.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const id = body?.id as string | undefined
    const targetCourses = body?.target_courses
    if (!id || !Array.isArray(targetCourses)) {
      return NextResponse.json({ error: 'id and target_courses[] are required' }, { status: 400 })
    }
    const db = createServerClient()
    const { error } = await db.from('listings')
      .update({ target_courses: targetCourses, target_courses_source: 'manual' })
      .eq('id', id)
    if (error) {
      console.error('[admin/listings PATCH] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[admin/listings PATCH] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    for (const field of REQUIRED) {
      if (!body[field]) {
        return NextResponse.json({ error: `Missing required field: ${field}` }, { status: 400 })
      }
    }
    const db = createServerClient()
    const { error } = await db.from('listings').insert({
      type: body.type,
      title: body.title,
      slug: body.slug,
      provider: body.provider,
      description: body.description ?? '',
      requirements: body.requirements ?? [],
      coverage: body.coverage ?? '',
      deadline: body.deadline ?? null,
      exam_date: body.exam_date ?? null,
      results_date: body.results_date ?? null,
      events: body.events ?? [],
      target_courses: body.target_courses ?? [],
      target_year_levels: body.target_year_levels ?? [],
      tags: body.tags ?? [],
      status: body.status,
      region: body.region,
      grant_amount: body.grant_amount ?? null,
      external_url: body.external_url ?? '',
      image_url: body.image_url ?? '',
      // Epic B scholarship typed fields
      province: body.province ?? null,
      city: body.city ?? null,
      scope: body.scope ?? 'national',
      is_verified: body.is_verified ?? false,
      income_ceiling: body.income_ceiling ?? null,
      gwa_requirement: body.gwa_requirement ?? null,
      monthly_stipend: body.monthly_stipend ?? null,
      service_obligation_years: body.service_obligation_years ?? null,
      has_entrance_exam: body.has_entrance_exam ?? false,
      application_window: body.application_window ?? null,
      scholarship_meta: body.scholarship_meta ?? {}
    })
    if (error) {
      console.error('[admin/listings POST] supabase error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    console.error('[admin/listings POST] unexpected:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
