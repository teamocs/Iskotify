// apps/admin/app/admin/upcat/review-queue/page.tsx
//
// Task F — Distractor Review Queue. Authored upcat_questions seed content is
// curated, not AI-generated, so it is never auto-rewritten (see task brief).
// Instead this view runs the pure flagWeakOptions() heuristics
// (apps/admin/lib/heuristics/flagWeakOptions.ts) over every question and
// lists the ones that fail — length asymmetry, duplicate/near-duplicate
// options, "none/all of the above", numeric outliers — so a human can fix
// them in the Edit drawer (which saves through the existing
// /api/upcat-questions/[id] PATCH route) or dismiss a flag that is fine as
// written. Dismissals are shared by the team (question_flag_dismissals,
// migration 059, via /api/admin/question-flags) and match on an options
// fingerprint, so an edit brings a still-weak flag back.
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ReviewQueueTable, type ReviewItem } from '@/components/admin/ReviewQueueTable'
import { flagWeakOptions } from '@/lib/heuristics/flagWeakOptions'
import type { DismissalRow } from '@/lib/admin/reviewQueue'

export const dynamic = 'force-dynamic'

// Keeps this a cheap read — upcat_questions is a few thousand rows at most.
const SCAN_LIMIT = 2000

interface QuestionRow {
  question_id: string
  question_text: string
  options: string[]
  correct_index: number
  main_subject: string | null
  topic: string | null
  subtest: string | null
  status: string
}

const INTRO =
  'Curated Question Bank options aren’t rewritten automatically. This queue flags questions whose options fail cheap ' +
  'heuristics (a length giveaway, a near-duplicate pair, “none/all of the above”, or a numeric outlier) so you can fix ' +
  'them by hand or dismiss a flag that is fine as written.'

export default async function ReviewQueuePage() {
  const db = createServerClient()

  const [{ data: rows, error }, dismissalsRes] = await Promise.all([
    db
      .from('upcat_questions')
      .select('question_id, question_text, options, correct_index, main_subject, topic, subtest, status')
      .order('question_id')
      .limit(SCAN_LIMIT),
    db.from('question_flag_dismissals').select('question_id, options_fingerprint'),
  ])
  const dismissals = (dismissalsRes.data ?? []) as DismissalRow[]

  const scanned = (rows ?? []) as QuestionRow[]
  const flagged: ReviewItem[] = scanned.flatMap(row => {
    const options = Array.isArray(row.options) ? row.options : []
    const result = flagWeakOptions(options)
    return result.clean
      ? []
      : [{
          question_id: row.question_id,
          question_text: row.question_text,
          options,
          correct_index: row.correct_index,
          main_subject: row.main_subject,
          topic: row.topic,
          flags: result.flags,
        }]
  })

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Distractor Review Queue" />
      <PageBody intro={INTRO}>
        {error ? (
          <ErrorBanner title="Couldn’t load the Question Bank" message={error.message} />
        ) : (
          <>
            {dismissalsRes.error && (
              <ErrorBanner
                title="Couldn’t load dismissed flags"
                message={`Every flag is shown, including ones the team dismissed. ${dismissalsRes.error.message}`}
              />
            )}
            <p className="text-xs text-ink-muted tabular-nums">
              {flagged.length} flagged out of {scanned.length} scanned
              {scanned.length >= SCAN_LIMIT ? ` (capped at ${SCAN_LIMIT})` : ''}.
            </p>
            <ReviewQueueTable items={flagged} dismissals={dismissals} />
          </>
        )}
      </PageBody>
    </div>
  )
}
