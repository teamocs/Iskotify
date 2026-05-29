import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topicId: string }> },
) {
  const { topicId } = await params
  const supabase = createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const slugs: unknown = body?.listing_slugs
  if (!Array.isArray(slugs) || slugs.length === 0 || !slugs.every(s => typeof s === 'string')) {
    return NextResponse.json({ error: 'listing_slugs must be a non-empty array of strings' }, { status: 400 })
  }

  const { error: topicErr } = await supabase
    .from('flashcard_topics')
    .update({ status: 'published' })
    .eq('id', topicId)
  if (topicErr) return NextResponse.json({ error: topicErr.message }, { status: 500 })

  const { error: cardErr } = await supabase
    .from('flashcards')
    .update({ status: 'published', listing_slugs: slugs })
    .eq('topic_id', topicId)
  if (cardErr) return NextResponse.json({ error: cardErr.message }, { status: 500 })

  return NextResponse.json({ topic_id: topicId, listing_slugs: slugs })
}
