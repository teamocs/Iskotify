import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as { cardId?: string } | null
  const cardId = body?.cardId
  if (!cardId) {
    return NextResponse.json({ error: 'cardId required' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: card } = await supabase
    .from('flashcards')
    .select('id, question, answer, flashcard_topics(name, flashcard_subjects(name))')
    .eq('id', cardId)
    .single()

  if (!card) {
    return NextResponse.json({ error: 'Card not found' }, { status: 404 })
  }

  const topicName = (card as any).flashcard_topics?.name ?? 'General'
  const subjectName = (card as any).flashcard_topics?.flashcard_subjects?.name ?? 'General Knowledge'

  const result = await generateDistractorsForCard({
    subject: subjectName,
    topic: topicName,
    question: card.question,
    answer: card.answer,
  })

  if (!result) {
    return NextResponse.json({ cached: false, reason: 'gemini_failed_or_rejected' })
  }

  const { error: updateError } = await supabase
    .from('flashcards')
    .update({
      ai_options: result.options,
      ai_correct_index: result.correctIndex,
      ai_explanation: result.explanation,
      ai_enhanced_at: new Date().toISOString(),
      option_explanations: result.optionExplanations,
      strategy_tip: result.strategyTip,
    })
    .eq('id', cardId)

  if (updateError) {
    console.warn('[/distractors] cache write failed:', updateError.message)
    return NextResponse.json({ cached: false, reason: 'cache_write_failed' })
  }

  return NextResponse.json({ cached: true, options: result.options, correctIndex: result.correctIndex })
}
