import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'
import { createAuthClient } from '@/lib/supabase'

interface CardInput {
  question: string
  answer: string
  explanation?: string
}

const CONCURRENCY = 4

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

async function backfillDistractorsFor(
  cards: Array<{ id: string; question: string; answer: string }>,
  subjectName: string,
  topicName: string,
) {
  const supabase = createServerClient()
  for (let i = 0; i < cards.length; i += CONCURRENCY) {
    const slice = cards.slice(i, i + CONCURRENCY)
    await Promise.all(slice.map(async card => {
      const result = await generateDistractorsForCard({
        subject: subjectName,
        topic: topicName,
        question: card.question,
        answer: card.answer,
      })
      if (!result) return
      await supabase
        .from('flashcards')
        .update({
          ai_options: result.options,
          ai_correct_index: result.correctIndex,
          ai_explanation: result.explanation,
          ai_enhanced_at: new Date().toISOString(),
        })
        .eq('id', card.id)
    }))
  }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error
    const { supabase } = gate

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

    const { data: inserted, error: cardsError } = await supabase
      .from('flashcards')
      .insert(flashcards)
      .select('id, question, answer')

    if (cardsError) {
      console.error('[manual] cards insert error:', cardsError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    // Fire-and-forget: generate distractors for each new card in the background.
    // We return success to the admin immediately; distractors land within ~30s/card.
    void backfillDistractorsFor(inserted ?? [], subject_name, topic_name)

    return NextResponse.json({ ok: true, topic_id: topic.id })
  } catch (err) {
    console.error('[manual] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
