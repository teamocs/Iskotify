'use client'

import { useState, useTransition } from 'react'

interface TopicOption {
  id: string
  name: string
}

interface SubjectOption {
  id: string
  name: string
  topics: TopicOption[]
}

interface Props {
  subjects: SubjectOption[]
}

/**
 * Task F bulk admin action — "Regenerate distractors (hard mode)" for
 * EXISTING flashcards. Calls /api/flashcards/regenerate-distractors, which
 * reuses generateDistractorsForCard (its prompt was rewritten for Task F
 * around an explicit difficulty rubric + WEAK-vs-STRONG few-shots) to
 * overwrite ai_options/ai_correct_index AND option_explanations/strategy_tip
 * in the SAME Gemini call — regenerating one without the other would leave
 * stale explanations paired with new options.
 *
 * Always-visible inline toolbar (not a popover) — mirrors the "Bulk fix"
 * strip in apps/admin/app/admin/upcat/import/page.tsx, and keeps every
 * control statically present in the server-rendered markup so it renders
 * (and is testable) without needing interaction/hydration.
 */
export function RegenerateDistractorsPanel({ subjects }: Props) {
  const [isPending, startTransition] = useTransition()
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [scope, setScope] = useState<'ai_enhanced' | 'all'>('ai_enhanced')
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  const topics = subjects.find(s => s.id === subjectId)?.topics ?? []

  function handleRun() {
    startTransition(async () => {
      try {
        const res = await fetch('/api/flashcards/regenerate-distractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject_id: subjectId || undefined,
            topic_id: topicId || undefined,
            scope,
          }),
        })
        const body = await res.json() as {
          succeeded?: number; failed?: number; remaining?: number; error?: string
        }
        if (!res.ok) {
          setToast({ msg: body.error ?? 'Regeneration failed', ok: false })
        } else {
          setToast({
            msg: `Regenerated ${body.succeeded ?? 0} · Failed ${body.failed ?? 0} · ${body.remaining ?? 0} remaining`,
            ok: true,
          })
        }
      } catch {
        setToast({ msg: 'Network error', ok: false })
      }
      setTimeout(() => setToast(null), 6000)
    })
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2 rounded-xl border border-[#800000]/20 bg-[#800000]/[0.03] px-3 py-2">
      <span className="text-[11px] font-semibold text-[#800000] whitespace-nowrap">🎯 Regenerate distractors (hard mode)</span>

      <select
        aria-label="Subject filter"
        value={subjectId}
        onChange={e => { setSubjectId(e.target.value); setTopicId('') }}
        className="border border-black/[0.1] rounded-md px-2 py-1 text-[12px] bg-white text-[#1d1d1f]"
      >
        <option value="">All subjects</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <select
        aria-label="Topic filter"
        value={topicId}
        onChange={e => setTopicId(e.target.value)}
        disabled={!subjectId}
        className="border border-black/[0.1] rounded-md px-2 py-1 text-[12px] bg-white text-[#1d1d1f] disabled:opacity-50"
      >
        <option value="">{subjectId ? 'All topics in subject' : 'All topics'}</option>
        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <select
        aria-label="Card scope"
        value={scope}
        onChange={e => setScope(e.target.value === 'all' ? 'all' : 'ai_enhanced')}
        className="border border-black/[0.1] rounded-md px-2 py-1 text-[12px] bg-white text-[#1d1d1f]"
      >
        <option value="ai_enhanced">Only already AI-enhanced cards</option>
        <option value="all">All cards in scope</option>
      </select>

      <button
        type="button"
        onClick={handleRun}
        disabled={isPending}
        className="rounded-[980px] px-3 py-1 text-[12px] font-semibold bg-[#800000] text-white hover:bg-[#6b0000] transition-colors disabled:opacity-60"
      >
        {isPending ? '⏳ Regenerating…' : 'Run'}
      </button>

      {toast && (
        <div className={`absolute top-full mt-1 right-0 z-50 rounded-[12px] px-4 py-2.5 text-[12px] font-medium shadow-lg whitespace-nowrap ${
          toast.ok ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
