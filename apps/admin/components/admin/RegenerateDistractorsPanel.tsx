'use client'

import { useId, useState, useTransition } from 'react'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Button } from '@/components/ui/Button'
import { controlClass } from '@/components/ui/Field'

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

const selectClass = `${controlClass} h-8 w-auto text-ui`

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
  const headingId = useId()

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
          notifyError(body.error ?? 'Regeneration failed')
          return
        }
        notifySuccess(`Regenerated ${body.succeeded ?? 0} · Failed ${body.failed ?? 0} · ${body.remaining ?? 0} remaining`)
      } catch {
        notifyError('Network error')
      }
    })
  }

  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-wrap items-center gap-2 rounded-sm border border-subtle bg-surface px-3 py-2">
      <span id={headingId} className="whitespace-nowrap text-ui font-semibold text-ink">Regenerate distractors (hard mode)</span>

      <select
        aria-label="Subject filter"
        value={subjectId}
        onChange={e => { setSubjectId(e.target.value); setTopicId('') }}
        className={selectClass}
      >
        <option value="">All subjects</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      <select
        aria-label="Topic filter"
        value={topicId}
        onChange={e => setTopicId(e.target.value)}
        disabled={!subjectId}
        className={selectClass}
      >
        <option value="">{subjectId ? 'All topics in subject' : 'All topics'}</option>
        {topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <select
        aria-label="Card scope"
        value={scope}
        onChange={e => setScope(e.target.value === 'all' ? 'all' : 'ai_enhanced')}
        className={selectClass}
      >
        <option value="ai_enhanced">Only already AI-enhanced cards</option>
        <option value="all">All cards in scope</option>
      </select>

      <Button size="sm" loading={isPending} onClick={handleRun}>
        {isPending ? 'Regenerating…' : 'Run'}
      </Button>
    </div>
  )
}
