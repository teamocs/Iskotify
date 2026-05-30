import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(req: NextRequest) {
  const topicId = req.nextUrl.searchParams.get('topic_id')
  if (!topicId) return NextResponse.json({ error: 'topic_id required' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcards')
    .select('id, question, answer, explanation, options, correct_answer_index, ai_options, ai_correct_index, ai_explanation, ai_enhanced_at')
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

    // Batch path: body has `cards` array (used by GenerateMoreModal for AI-generated cards with distractors).
    // Inserts all cards in one go and preserves ai_* fields; returns { inserted: N }.
    if (Array.isArray(body?.cards) && body.cards.length > 0) {
      if (!body.topic_id) {
        return NextResponse.json({ error: 'topic_id required' }, { status: 400 })
      }
      const listingSlugs: string[] = Array.isArray(body.listing_slugs)
        ? body.listing_slugs.filter((s: unknown) => typeof s === 'string')
        : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = body.cards.map((c: any) => ({
        topic_id: body.topic_id,
        question: typeof c.question === 'string' ? c.question.trim() : '',
        answer: typeof c.answer === 'string' ? c.answer.trim() : '',
        explanation: typeof c.explanation === 'string' ? c.explanation.trim() : '',
        status: 'published',
        listing_slugs: listingSlugs,
        ai_options: Array.isArray(c.aiOptions) ? c.aiOptions : null,
        ai_correct_index: typeof c.aiCorrectIndex === 'number' ? c.aiCorrectIndex : null,
        ai_explanation: typeof c.aiExplanation === 'string' ? c.aiExplanation : null,
        ai_enhanced_at:
          Array.isArray(c.aiOptions) && typeof c.aiCorrectIndex === 'number'
            ? new Date().toISOString()
            : null,
      }))
      const supabase = createServerClient()
      const { error } = await supabase.from('flashcards').insert(rows)
      if (error) {
        console.error('[cards/POST batch] insert error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ inserted: rows.length })
    }

    // Single-card path (existing behavior — unchanged).
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
