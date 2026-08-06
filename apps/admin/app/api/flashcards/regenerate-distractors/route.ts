import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { generateDistractorsForCard } from '@/lib/gemini/generateDistractors'

// Task F bulk admin action: "Regenerate distractors (hard mode)" for EXISTING
// flashcards. This reuses generateDistractorsForCard as-is — its prompt was
// rewritten for Task F around an explicit difficulty rubric + WEAK-vs-STRONG
// few-shots (see lib/gemini/generateDistractors.ts), so calling it again is
// what makes this "hard mode": no separate prompt path needed here.
//
// Regenerating options MUST also regenerate their matching
// option_explanations/strategy_tip in the SAME Gemini call — Task E's
// clear_ai_options_on_content_change trigger (049_question_explanations.sql)
// already guards against stale explanations surviving a content EDIT, but a
// bulk *regeneration* like this one writes new ai_options directly, bypassing
// that trigger's UPDATE-column-diff check entirely. generateDistractorsForCard
// returns optionExplanations/strategyTip index-aligned with the SAME options
// it just generated, so writing both from the same `result` object in one
// .update() call is what keeps them paired — never split into two writes.
//
// Auth + batching/filter shape mirrors /api/questions/explanations-backfill
// and /api/flashcards/enhance-batch: cookie-auth admin gate, CONCURRENCY-4
// batches, rate limiting handled inside generateDistractorsForCard via the
// shared Redis limiter (waitForRateAllow).
export const runtime = 'nodejs'
export const maxDuration = 60 // Vercel cap — mirrors enhance-batch/explanations-backfill

const CONCURRENCY = 4
const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

async function processBatch<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency)
    results.push(...await Promise.all(slice.map(fn)))
  }
  return results
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveTopicIds(supabase: any, subjectId?: string, topicId?: string): Promise<string[] | null> {
  if (topicId) return [topicId]
  if (subjectId) {
    const { data } = await supabase.from('flashcard_topics').select('id').eq('subject_id', subjectId)
    return (data ?? []).map((t: { id: string }) => t.id)
  }
  return null // no subject/topic filter — every topic is in scope
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await req.json().catch(() => ({})) as {
    subject_id?: string; topic_id?: string; scope?: string; limit?: number
  }
  // scope: 'ai_enhanced' restricts to cards that already have cached ai_options
  // (i.e. "regenerate" in the literal sense); 'all' (default) also picks up
  // cards that were never AI-enhanced in the first place.
  const scope = body.scope === 'ai_enhanced' ? 'ai_enhanced' : 'all'
  const rawLimit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : DEFAULT_LIMIT
  const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, rawLimit))

  const topicIds = await resolveTopicIds(supabase, body.subject_id, body.topic_id)
  // A subject/topic filter was given but resolved to zero topics (empty
  // subject, or a bad id) — nothing to do, and querying flashcards with an
  // empty .in() list would otherwise match everything, not nothing.
  if ((body.subject_id || body.topic_id) && topicIds && topicIds.length === 0) {
    return NextResponse.json({ attempted: 0, succeeded: 0, failed: 0, remaining: 0 })
  }

  let rowsQuery = supabase
    .from('flashcards')
    .select('id, question, answer, topic_id, ai_options, flashcard_topics(name, flashcard_subjects(name))')
    .limit(limit)
  if (topicIds) rowsQuery = rowsQuery.in('topic_id', topicIds)
  if (scope === 'ai_enhanced') rowsQuery = rowsQuery.not('ai_options', 'is', null)

  const { data: rows, error: rowsErr } = await rowsQuery
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 })

  const list = (rows ?? []) as Array<{
    id: string; question: string; answer: string; topic_id: string
    ai_options: string[] | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flashcard_topics: any
  }>

  const outcomes = await processBatch(list, async row => {
    const topicName = row.flashcard_topics?.name ?? 'General'
    const subjectName = row.flashcard_topics?.flashcard_subjects?.name ?? 'General Knowledge'

    const result = await generateDistractorsForCard({
      subject: subjectName, topic: topicName, question: row.question, answer: row.answer,
    })
    if (!result) return false

    // Single .update() writes ai_options/ai_correct_index and
    // option_explanations/strategy_tip together — from the same `result`, in
    // the same DB round trip — so they can never be paired from two
    // different Gemini calls.
    const { error } = await supabase
      .from('flashcards')
      .update({
        ai_options: result.options,
        ai_correct_index: result.correctIndex,
        ai_explanation: result.explanation,
        ai_enhanced_at: new Date().toISOString(),
        option_explanations: result.optionExplanations,
        strategy_tip: result.strategyTip,
      })
      .eq('id', row.id)
    return !error
  }, CONCURRENCY)

  const succeeded = outcomes.filter(Boolean).length
  const failed = outcomes.length - succeeded

  let countQuery = supabase.from('flashcards').select('*', { count: 'exact', head: true })
  if (topicIds) countQuery = countQuery.in('topic_id', topicIds)
  if (scope === 'ai_enhanced') countQuery = countQuery.not('ai_options', 'is', null)
  const { count: totalMatched } = await countQuery

  const remaining = Math.max(0, (totalMatched ?? 0) - list.length)

  if (succeeded > 0) revalidateTag('drafts')

  return NextResponse.json({ attempted: list.length, succeeded, failed, remaining })
}
