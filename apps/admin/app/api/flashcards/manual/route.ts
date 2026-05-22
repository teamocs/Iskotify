import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

interface CardInput {
  question: string
  answer: string
  explanation?: string
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subject_name, topic_name, listing_slugs, cards } = body as {
      subject_name?: string
      topic_name?: string
      listing_slugs?: string[]
      cards?: CardInput[]
    }

    if (!subject_name || !topic_name || !listing_slugs || listing_slugs.length === 0 || !cards || cards.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data: subject, error: subjectError } = await supabase
      .from('flashcard_subjects')
      .upsert({ name: subject_name }, { onConflict: 'name' })
      .select('id')
      .single()

    if (subjectError || !subject) {
      console.error('[manual] subject upsert error:', subjectError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const { data: topic, error: topicError } = await supabase
      .from('flashcard_topics')
      .insert({ name: topic_name, subject_id: subject.id, status: 'published' })
      .select('id')
      .single()

    if (topicError || !topic) {
      console.error('[manual] topic insert error:', topicError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    const flashcards = cards.map((c) => ({
      topic_id: topic.id,
      question: c.question,
      answer: c.answer,
      explanation: c.explanation ?? '',
      status: 'published',
      listing_slugs,
    }))

    const { error: cardsError } = await supabase.from('flashcards').insert(flashcards)
    if (cardsError) {
      console.error('[manual] cards insert error:', cardsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, topic_id: topic.id })
  } catch (err) {
    console.error('[manual] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
