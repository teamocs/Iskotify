import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get('topic_id')
  if (!topicId) return NextResponse.json({ error: 'topic_id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcards')
    .select('id, question, answer, explanation')
    .eq('topic_id', topicId)
    .order('created_at')

  if (error) {
    console.error('[cards] fetch error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { topic_id, question, answer, explanation, status, listing_slugs } = body as {
      topic_id?: string
      question?: string
      answer?: string
      explanation?: string
      status?: string
      listing_slugs?: string[]
    }

    if (!topic_id) return NextResponse.json({ error: 'topic_id is required' }, { status: 400 })
    if (!question || question.trim() === '') return NextResponse.json({ error: 'question is required' }, { status: 400 })
    if (!answer || answer.trim() === '') return NextResponse.json({ error: 'answer is required' }, { status: 400 })
    if (status && status !== 'published' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "published" or "draft"' }, { status: 400 })
    }

    const supabase = createServerClient()

    let resolvedSlugs: string[]
    if (listing_slugs && listing_slugs.length > 0) {
      resolvedSlugs = listing_slugs
    } else {
      const { data: sibling } = await supabase
        .from('flashcards')
        .select('listing_slugs')
        .eq('topic_id', topic_id)
        .limit(1)
        .single()
      resolvedSlugs = sibling?.listing_slugs ?? []
    }

    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        topic_id,
        question: question.trim(),
        answer: answer.trim(),
        explanation: explanation?.trim() ?? '',
        status: status ?? 'published',
        listing_slugs: resolvedSlugs,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[cards/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('[cards/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
