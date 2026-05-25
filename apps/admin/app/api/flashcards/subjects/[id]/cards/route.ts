import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params // Next.js 15.5 requires awaiting params even when unused
  const url = req.nextUrl
  const topic_id = url.searchParams.get('topic_id')

  if (!topic_id) {
    return NextResponse.json({ error: 'topic_id is required' }, { status: 400 })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)))
  const offset = (page - 1) * limit

  const supabase = createServerClient()
  const { data, count, error } = await supabase
    .from('flashcards')
    .select('id, question, answer, explanation', { count: 'exact' })
    .eq('topic_id', topic_id)
    .order('created_at')
    .order('id')
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[subjects/cards] fetch error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const total = count ?? 0
  const cards = data ?? []
  return NextResponse.json({
    cards,
    total,
    page,
    hasMore: offset + cards.length < total,
  })
}
