import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { parseLegacyEmbeddedMcq } from '@/lib/sanitize/legacyMcq'

const DEFAULT_LIMIT = 100
const MIN_LIMIT = 1
const MAX_LIMIT = 1000

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.ADMIN_BACKFILL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(req.url)
  const rawLimit = parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10)
  const limit = Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit))
  const dryRun = url.searchParams.get('dry_run') !== '0'  // default true (safe)

  const supabase = createServerClient()

  // Candidate rows: question contains the embedded-MCQ pattern AND options is empty
  // (cards already with proper options[] shouldn't be re-processed).
  // Using a wide regex; the parser does the real validation.
  const { data: cards } = await supabase
    .from('flashcards')
    .select('id, question, answer')
    .not('question', 'is', null)
    .limit(limit)

  const candidates = (cards ?? []).filter(c =>
    /\bA[.)]/.test(c.question) && /\bB[.)]/.test(c.question) && /\bC[.)]/.test(c.question) && /\bD[.)]/.test(c.question)
  )

  let parsedOk = 0
  let parseFailed = 0
  let answerMismatch = 0
  let updated = 0
  const failures: Array<{ id: string; reason: string }> = []

  for (const card of candidates) {
    const result = parseLegacyEmbeddedMcq({ question: card.question, answer: card.answer })
    if (!result) {
      // Distinguish "doesn't match MCQ format" vs "answer doesn't match"
      const formatMatches = /\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/.test(card.question)
      if (formatMatches) {
        answerMismatch++
        failures.push({ id: card.id, reason: 'answer_mismatch' })
      } else {
        parseFailed++
        failures.push({ id: card.id, reason: 'parse_failed' })
      }
      continue
    }
    parsedOk++

    if (!dryRun) {
      const { error } = await supabase
        .from('flashcards')
        .update({
          question: result.stem,
          options: result.options,
          correct_answer_index: result.correctIndex,
        })
        .eq('id', card.id)
      if (!error) updated++
    }
  }

  return NextResponse.json({
    scanned: candidates.length,
    parsed_ok: parsedOk,
    parse_failed: parseFailed,
    answer_mismatch: answerMismatch,
    updated,
    dry_run: dryRun,
    failures: failures.slice(0, 20),
  })
}
