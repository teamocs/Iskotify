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
