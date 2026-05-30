import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest) {
  // Auth — cookie-aware client for the user, data client for the role + reads.
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Fetch all draft topics with their subject + raw cards array.
  // We derive counters in JS to keep the query simple and to avoid Postgres array tricks.
  const { data, error } = await supabase
    .from('flashcard_topics')
    .select(`
      id, name, source_type, created_at,
      flashcard_subjects:flashcard_subjects!subject_id (id, name),
      flashcards (options, ai_options)
    `)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const drafts = (data ?? []).map((t: any) => {
    const cards: Array<{ options: string[] | null; ai_options: string[] | null }> = t.flashcards ?? []
    const total_cards = cards.length
    const cards_with_options = cards.filter(c => Array.isArray(c.options) && c.options.length >= 4).length
    const cards_enhanced = cards.filter(c => Array.isArray(c.ai_options) && c.ai_options.length >= 4).length
    const cards_needing_enhancement = cards.filter(
      c => (!Array.isArray(c.options) || c.options.length < 4) && (!Array.isArray(c.ai_options) || c.ai_options.length < 4),
    ).length
    return {
      topic_id: t.id,
      topic_name: t.name,
      subject_id: t.flashcard_subjects?.id ?? null,
      subject_name: t.flashcard_subjects?.name ?? 'Unknown',
      source_type: t.source_type,
      created_at: t.created_at,
      total_cards,
      cards_with_options,
      cards_enhanced,
      cards_needing_enhancement,
    }
  })

  return NextResponse.json({ drafts })
}
