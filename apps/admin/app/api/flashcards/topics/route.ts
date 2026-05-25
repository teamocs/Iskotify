import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subject_id, name, status } = body as {
      subject_id?: string
      name?: string
      status?: string
    }

    if (!subject_id || subject_id.trim() === '') {
      return NextResponse.json({ error: 'subject_id is required' }, { status: 400 })
    }
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (status && status !== 'published' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "published" or "draft"' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('flashcard_topics')
      .insert({ subject_id: subject_id.trim(), name: name.trim(), status: status ?? 'published' })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[topics/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('[topics/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
