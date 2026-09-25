import { NextRequest, NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { errorMessage } from '@/lib/errorMessage'
import { embedOne } from '@/lib/embedOne'

export const runtime = 'nodejs'

/** One draft topic as fetchDrafts selects it. */
interface DraftTopicRow {
  id: string
  name: string
  source_type: string | null
  created_at: string
  flashcard_subjects: { id: string; name: string } | { id: string; name: string }[] | null
  flashcards: Array<{ options: string[] | null; ai_options: string[] | null }> | null
}

const fetchDrafts = unstable_cache(
  async () => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('flashcard_topics')
      .select(`
        id, name, source_type, created_at,
        flashcard_subjects:flashcard_subjects!subject_id (id, name),
        flashcards (options, ai_options)
      `)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as DraftTopicRow[]
  },
  ['flashcards-drafts'],
  { tags: ['drafts'], revalidate: 30 },
)

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
  let rawTopics: DraftTopicRow[]
  try {
    rawTopics = await fetchDrafts()
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err, 'Database error') }, { status: 500 })
  }

  const drafts = rawTopics.map(t => {
    const cards = t.flashcards ?? []
    const subject = embedOne(t.flashcard_subjects)
    const total_cards = cards.length
    const cards_with_options = cards.filter(c => Array.isArray(c.options) && c.options.length >= 4).length
    const cards_enhanced = cards.filter(c => Array.isArray(c.ai_options) && c.ai_options.length >= 4).length
    const cards_needing_enhancement = cards.filter(
      c => (!Array.isArray(c.options) || c.options.length < 4) && (!Array.isArray(c.ai_options) || c.ai_options.length < 4),
    ).length
    return {
      topic_id: t.id,
      topic_name: t.name,
      subject_id: subject?.id ?? null,
      subject_name: subject?.name ?? 'Unknown',
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
