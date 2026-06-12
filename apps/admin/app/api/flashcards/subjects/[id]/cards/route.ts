import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

function buildFetcher(id: string, topic_id: string, page: number, limit: number) {
  const offset = (page - 1) * limit
  return unstable_cache(
    async () => {
      const supabase = createServerClient()
      const { data, count, error } = await supabase
        .from('flashcards')
        .select('id, question, answer, explanation, listing_slugs', { count: 'exact' })
        .eq('topic_id', topic_id)
        .order('created_at')
        .order('id')
        .range(offset, offset + limit - 1)

      if (error) throw error
      const total = count ?? 0
      const cards = data ?? []
      return { cards, total, page, hasMore: offset + cards.length < total }
    },
    ['subject-cards', id, topic_id, String(page), String(limit)],
    { tags: [`subject-cards:${id}`, 'subject-cards'], revalidate: 120 },
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const { id } = await params
  const url = req.nextUrl
  const topic_id = url.searchParams.get('topic_id')

  if (!topic_id) {
    return NextResponse.json({ error: 'topic_id is required' }, { status: 400 })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10', 10)))

  try {
    const data = await buildFetcher(id, topic_id, page, limit)()
    return NextResponse.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Database error'
    console.error('[subjects/cards] fetch error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
