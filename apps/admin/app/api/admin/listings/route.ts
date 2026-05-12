import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

const REQUIRED = ['type', 'title', 'slug', 'provider', 'status', 'region'] as const

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
      image_url: body.image_url ?? ''
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
