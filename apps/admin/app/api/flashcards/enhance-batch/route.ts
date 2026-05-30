import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'

export const runtime = 'nodejs'
export const maxDuration = 60  // Vercel cap

const RATE_DELAY_MS = 170  // ~6 req/sec — under Gemini free-tier 15rpm/1500rpd

export async function POST(req: NextRequest) {
  // Auth — cookie-aware client for the user, data client for the role + writes.
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const topicId = body?.topic_id
  if (typeof topicId !== 'string') {
    return NextResponse.json({ error: 'topic_id required' }, { status: 400 })
  }

  // Fetch topic + subject names for prompt context
  const { data: topic, error: topicErr } = await supabase
    .from('flashcard_topics')
    .select('id, name, flashcard_subjects(name)')
    .eq('id', topicId)
    .single()
  if (topicErr || !topic) return NextResponse.json({ error: 'Topic not found' }, { status: 404 })

  const subjectName = (topic as any).flashcard_subjects?.name ?? 'General'
  const topicName = topic.name

  // Fetch cards needing enhancement
  const { data: cards, error: cardsErr } = await supabase
    .from('flashcards')
    .select('id, question, answer')
    .eq('topic_id', topicId)
    .or('options.is.null,options.eq.{}')
    .is('ai_options', null)
  if (cardsErr) return NextResponse.json({ error: cardsErr.message }, { status: 500 })

  const list = cards ?? []
  let enhanced = 0
  let failed = 0

  for (const card of list) {
    try {
      const result = await generateDistractorsForCard({
        subject: subjectName,
        topic: topicName,
        question: card.question,
        answer: card.answer,
      })
      if (!result) {
        failed++
      } else {
        await supabase.from('flashcards').update({
          ai_options: result.options,
          ai_correct_index: result.correctIndex,
          ai_explanation: result.explanation,
          ai_enhanced_at: new Date().toISOString(),
        }).eq('id', card.id)
        enhanced++
      }
    } catch (err) {
      console.error('[enhance-batch] card failed:', card.id, err)
      failed++
    }
    await new Promise(r => setTimeout(r, RATE_DELAY_MS))
  }

  return NextResponse.json({ topic_id: topicId, attempted: list.length, enhanced, failed })
}
