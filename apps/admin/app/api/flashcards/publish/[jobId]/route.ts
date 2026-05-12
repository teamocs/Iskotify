import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params

  const body = await req.json()
  const { listing_slugs, subject_name, topic_name } = body as {
    listing_slugs: string[]
    subject_name: string
    topic_name: string
  }

  if (!listing_slugs || listing_slugs.length === 0) {
    return NextResponse.json(
      { error: 'Select at least one exam tag before publishing' },
      { status: 400 }
    )
  }

  const supabase = createServerClient()

  const { data: job, error: jobError } = await supabase
    .from('pdf_jobs')
    .select('topic_id, subject_id')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const { data: cards, error: cardsError } = await supabase
    .from('flashcards')
    .select('id')
    .eq('topic_id', job.topic_id)
    .single()

  if (cardsError && cardsError.code !== 'PGRST116') {
    console.error('[publish] cards fetch error:', cardsError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const cardList = Array.isArray(cards) ? cards : cards ? [cards] : []
  if (cardList.length === 0) {
    return NextResponse.json({ error: 'No cards to publish' }, { status: 400 })
  }

  const { error: subjErr } = await supabase
    .from('flashcard_subjects')
    .update({ name: subject_name })
    .eq('id', job.subject_id)

  if (subjErr) {
    console.error('[publish] subject update error:', subjErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const { error: topicErr } = await supabase
    .from('flashcard_topics')
    .update({ name: topic_name, status: 'published' })
    .eq('id', job.topic_id)

  if (topicErr) {
    console.error('[publish] topic update error:', topicErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const { error: cardsUpdateErr } = await supabase
    .from('flashcards')
    .update({ status: 'published', listing_slugs })
    .eq('topic_id', job.topic_id)

  if (cardsUpdateErr) {
    console.error('[publish] cards update error:', cardsUpdateErr)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, published: cardList.length })
}
