import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'

const CONCURRENCY = 4
const DEFAULT_LIMIT = 50
const MIN_LIMIT = 1
const MAX_LIMIT = 200

async function processBatch<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    const batch = await Promise.all(slice.map(fn))
    results.push(...batch)
  }
  return results
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit))

  const supabase = createServerClient()

  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, question, answer, flashcard_topics(name, flashcard_subjects(name))')
    .is('ai_enhanced_at', null)
    .limit(limit)

  const cardList = cards ?? []

  const outcomes = await processBatch(cardList, async (card: any) => {
    const topicName = card.flashcard_topics?.name ?? 'General'
    const subjectName = card.flashcard_topics?.flashcard_subjects?.name ?? 'General Knowledge'

    const result = await generateDistractorsForCard({
      subject: subjectName,
      topic: topicName,
      question: card.question,
      answer: card.answer,
    })
    if (!result) return false

    const { error: updateError } = await supabase
      .from('flashcards')
      .update({
        ai_options: result.options,
        ai_correct_index: result.correctIndex,
        ai_explanation: result.explanation,
        ai_enhanced_at: new Date().toISOString(),
      })
      .eq('id', card.id)
    return !updateError
  }, CONCURRENCY)

  const succeeded = outcomes.filter(Boolean).length
  const failed = outcomes.length - succeeded

  const { count: remaining } = await supabase
    .from('flashcards')
    .select('id', { count: 'exact', head: true })
    .is('ai_enhanced_at', null)

  return NextResponse.json({
    processed: cardList.length,
    succeeded,
    failed,
    remaining: remaining ?? 0,
  })
}
