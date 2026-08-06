import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'
import { generateOptionExplanations } from '@/lib/gemini/generateDistractors'

// Task E bulk admin action: "Generate explanations" for EXISTING upcat_questions
// / flashcards rows that already have their 4 options + correct answer, just
// missing option_explanations/strategy_tip (migration 049). Mirrors the
// cookie-auth + admin-role pattern of /api/flashcards/enhance-batch, and the
// batching/concurrency shape of /api/flashcards/backfill.
//
// A plain `.update(...)` on either table bumps updated_at automatically via
// each table's `update_updated_at` / `flashcards_updated_at` trigger (see
// 001_initial_schema.sql / 006_flashcard_updated_at.sql) — required so the
// mobile app's incremental cursor sync (services/sync.ts) actually pulls the
// new content down, per the note in 049_question_explanations.sql.
//
// Eligibility filter (Finding 4 fix): filters on `option_explanations = '[]'`
// (the column's DB default — see 049_question_explanations.sql), NOT on
// `strategy_tip = ''`. generateOptionExplanations legitimately returns
// strategyTip:'' on a row it successfully processed (it only returns null —
// meaning nothing gets written — when EVERY field, including all option
// rationales, comes back empty; see generateDistractors.ts). A successful
// write always sets option_explanations to a 4-length array (possibly all
// null entries, but never `[]`), so this filter can't re-trigger on rows
// that were already processed, while still catching rows where the Gemini
// call failed or was never attempted (which leave option_explanations at
// its untouched '[]' default).
export const runtime = 'nodejs'
export const maxDuration = 60

const CONCURRENCY = 4
const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100

type Source = 'flashcards' | 'upcat_questions'

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
async function processUpcatQuestions(supabase: any, limit: number) {
  const { data: rows } = await supabase
    .from('upcat_questions')
    .select('question_id, question_text, options, correct_index, main_subject, topic')
    .eq('option_explanations', '[]')
    .limit(limit)

  const list = (rows ?? []) as Array<{
    question_id: string; question_text: string; options: string[]; correct_index: number
    main_subject: string | null; topic: string | null
  }>

  const outcomes = await processBatch(list, async row => {
    if (!Array.isArray(row.options) || row.options.length !== 4) return false
    const result = await generateOptionExplanations({
      subject: row.main_subject ?? 'General',
      topic: row.topic ?? 'General',
      question: row.question_text,
      options: row.options,
      correctIndex: row.correct_index,
    })
    if (!result) return false
    const { error } = await supabase
      .from('upcat_questions')
      .update({ option_explanations: result.optionExplanations, strategy_tip: result.strategyTip })
      .eq('question_id', row.question_id)
    return !error
  }, CONCURRENCY)

  return { attempted: list.length, outcomes }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processFlashcards(supabase: any, limit: number) {
  const { data: rows } = await supabase
    .from('flashcards')
    .select('id, question, options, correct_answer_index, ai_options, ai_correct_index, flashcard_topics(name, flashcard_subjects(name))')
    .eq('option_explanations', '[]')
    .limit(limit)

  const list = (rows ?? []) as Array<{
    id: string; question: string
    options: string[] | null; correct_answer_index: number | null
    ai_options: string[] | null; ai_correct_index: number | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flashcard_topics: any
  }>

  const outcomes = await processBatch(list, async row => {
    // Mirror the app's runtime priority (buildQuizQuestions): prefer aiOptions
    // when present, else the admin-authored options — so the rationale is
    // aligned with whichever option set is actually served to students.
    const useAi = Array.isArray(row.ai_options) && row.ai_options.length === 4 && row.ai_correct_index != null
    const options = useAi ? row.ai_options! : row.options
    const correctIndex = useAi ? row.ai_correct_index! : row.correct_answer_index
    if (!Array.isArray(options) || options.length !== 4 || correctIndex == null) return false

    const topicName = row.flashcard_topics?.name ?? 'General'
    const subjectName = row.flashcard_topics?.flashcard_subjects?.name ?? 'General Knowledge'

    const result = await generateOptionExplanations({
      subject: subjectName, topic: topicName, question: row.question, options, correctIndex,
    })
    if (!result) return false
    const { error } = await supabase
      .from('flashcards')
      .update({ option_explanations: result.optionExplanations, strategy_tip: result.strategyTip })
      .eq('id', row.id)
    return !error
  }, CONCURRENCY)

  return { attempted: list.length, outcomes }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate

  const body = await req.json().catch(() => ({})) as { source?: string; limit?: number }
  const source = body.source
  if (source !== 'flashcards' && source !== 'upcat_questions') {
    return NextResponse.json({ error: "source must be 'flashcards' or 'upcat_questions'" }, { status: 400 })
  }
  const rawLimit = typeof body.limit === 'number' && Number.isFinite(body.limit) ? Math.floor(body.limit) : DEFAULT_LIMIT
  const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, rawLimit))

  const { attempted, outcomes } = source === 'upcat_questions'
    ? await processUpcatQuestions(supabase, limit)
    : await processFlashcards(supabase, limit)

  const succeeded = outcomes.filter(Boolean).length
  const failed = outcomes.length - succeeded

  const { count: remaining } = await supabase
    .from(source as Source)
    .select('*', { count: 'exact', head: true })
    .eq('option_explanations', '[]')

  if (succeeded > 0 && source === 'flashcards') revalidateTag('drafts')

  return NextResponse.json({ source, attempted, succeeded, failed, remaining: remaining ?? 0 })
}
