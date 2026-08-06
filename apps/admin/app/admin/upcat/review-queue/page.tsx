// apps/admin/app/admin/upcat/review-queue/page.tsx
//
// Task F — Distractor Review Queue. Authored upcat_questions seed content is
// curated, not AI-generated, so it is never auto-rewritten (see task brief).
// Instead this is a READ-ONLY view: it runs the pure flagWeakOptions()
// heuristics (apps/admin/lib/heuristics/flagWeakOptions.ts) over every
// published question and lists the ones that fail — length asymmetry,
// duplicate/near-duplicate options, "none/all of the above", numeric
// outliers — so a human can fix them by hand (via the existing
// /api/upcat-questions/[id] PATCH route, the CSV re-import flow, or directly
// in Supabase). No new migration needed — this is a plain SELECT.
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { flagWeakOptions, type WeakOptionFlag } from '@/lib/heuristics/flagWeakOptions'

export const dynamic = 'force-dynamic'

// Keeps this a cheap read — upcat_questions is a few thousand rows at most,
// and a review queue is meant to be worked down over time, not paginated.
const SCAN_LIMIT = 2000

const FLAG_LABELS: Record<WeakOptionFlag, string> = {
  length_asymmetry: 'Short option (< 40% of longest)',
  duplicate_options: 'Duplicate / near-duplicate options',
  none_or_all_of_above: '"None/All of the above"',
  numeric_outlier: 'Numeric outlier',
}

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

export default async function ReviewQueuePage() {
  const db = createServerClient()

  const { data: rows } = await db
    .from('upcat_questions')
    .select('question_id, question_text, options, correct_index, main_subject, topic, subtest, status')
    .order('question_id')
    .limit(SCAN_LIMIT)

  const scanned = (rows ?? []) as QuestionRow[]
  const flagged = scanned
    .map(row => ({ row, result: flagWeakOptions(Array.isArray(row.options) ? row.options : []) }))
    .filter(({ result }) => !result.clean)

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Distractor Review Queue" />
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Distractor Review Queue</h2>
          <p className="text-[#6e6e73] text-sm mt-1 max-w-3xl">
            Curated Question Bank options aren&apos;t rewritten automatically — this list flags questions whose
            options fail cheap heuristics (a length giveaway, a near-duplicate pair, a &quot;none/all of the
            above&quot;, or a numeric outlier) so a human can fix them by hand.
          </p>
          <p className="text-[#6e6e73] text-xs mt-2">
            {flagged.length} flagged out of {scanned.length} scanned
            {scanned.length >= SCAN_LIMIT ? ` (capped at ${SCAN_LIMIT})` : ''}.
          </p>
        </div>

        {flagged.length === 0 ? (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center text-green-800 text-sm">
            🎉 No flagged questions. Nothing needs review right now.
          </div>
        ) : (
          <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[720px]">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">ID</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Subject / Topic</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Question</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Options</th>
                  <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Flags</th>
                </tr>
              </thead>
              <tbody>
                {flagged.map(({ row, result }) => (
                  <tr key={row.question_id} className="border-b border-[#f3f4f6] last:border-0 align-top hover:bg-[#f9fafb]">
                    <td className="px-4 py-3 font-mono text-xs text-[#374151] whitespace-nowrap">{row.question_id}</td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <div className="text-[#374151]">{row.main_subject ?? '—'}</div>
                      <div className="text-[#9ca3af]">{row.topic ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-[#1d1d1f] max-w-xs">{row.question_text}</td>
                    <td className="px-4 py-3 text-[#374151]">
                      <ul className="space-y-0.5">
                        {(row.options ?? []).map((opt, i) => (
                          <li key={i} className={i === row.correct_index ? 'font-semibold text-green-700' : ''}>
                            {String.fromCharCode(65 + i)}. {opt}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {result.flags.map(flag => (
                          <span
                            key={flag}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800"
                          >
                            {FLAG_LABELS[flag]}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
