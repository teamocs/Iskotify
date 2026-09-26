'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WeakOptionFlag } from '@/lib/heuristics/flagWeakOptions'
import {
  addDismissal, dismissalKey, dismissalKeysFrom, optionsFingerprint, partitionByDismissal, removeDismissal,
  type DismissalRow,
} from '@/lib/admin/reviewQueue'
import { apiRequest } from '@/lib/apiRequest'
import { notifyError } from '@/lib/toast'
import { TABLE_FRAME } from '@/components/ui/Table'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { QuestionEditDrawer } from './QuestionEditDrawer'

export interface ReviewItem {
  question_id: string
  question_text: string
  options: string[]
  correct_index: number
  main_subject: string | null
  topic: string | null
  flags: WeakOptionFlag[]
}

export const FLAG_LABELS: Record<WeakOptionFlag, string> = {
  length_asymmetry: 'Short option (< 40% of longest)',
  duplicate_options: 'Duplicate or near-duplicate options',
  none_or_all_of_above: 'None/All of the above',
  numeric_outlier: 'Numeric outlier',
}

const letter = (i: number) => String.fromCharCode(65 + i)

const FLAGS_API = '/api/admin/question-flags'

const flagBody = (item: ReviewItem) => ({ question_id: item.question_id, options_fingerprint: optionsFingerprint(item.options) })

/**
 * The queue itself. Dismissals are shared by the whole team (server table
 * question_flag_dismissals); this component applies them optimistically and
 * rolls back if the route refuses.
 */
export function ReviewQueueTable({ items, dismissals }: { items: ReviewItem[]; dismissals: DismissalRow[] }) {
  const router = useRouter()
  // Keys joined by a newline, which cannot appear in a question id or fingerprint.
  const serverSignature = dismissalKeysFrom(dismissals).join('\n')
  const [dismissed, setDismissed] = useState<string[]>(() => dismissalKeysFrom(dismissals))
  const [showDismissed, setShowDismissed] = useState(false)
  const [lastDismissed, setLastDismissed] = useState<ReviewItem | null>(null)
  const [editing, setEditing] = useState<ReviewItem | null>(null)

  // Follow the server after router.refresh() (someone else may have dismissed or
  // restored), adjusted while rendering rather than in an effect.
  const [seenSignature, setSeenSignature] = useState(serverSignature)
  if (serverSignature !== seenSignature) {
    setSeenSignature(serverSignature)
    setDismissed(serverSignature ? serverSignature.split('\n') : [])
  }

  const dismiss = useCallback(async (item: ReviewItem) => {
    const key = dismissalKey(item.question_id, item.options)
    setDismissed(d => addDismissal(d, key))
    setLastDismissed(item)
    const result = await apiRequest(FLAGS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flagBody(item)),
    })
    if (!result.ok) {
      setDismissed(d => removeDismissal(d, key))
      setLastDismissed(null)
      notifyError(`Couldn’t dismiss the flag on ${item.question_id}: ${result.error}`)
      return
    }
    router.refresh()
  }, [router])

  const restore = useCallback(async (item: ReviewItem) => {
    const key = dismissalKey(item.question_id, item.options)
    setDismissed(d => removeDismissal(d, key))
    setLastDismissed(null)
    const { question_id, options_fingerprint } = flagBody(item)
    const qs = new URLSearchParams({ question_id, options_fingerprint }).toString()
    const result = await apiRequest(`${FLAGS_API}?${qs}`, { method: 'DELETE' })
    if (!result.ok) {
      setDismissed(d => addDismissal(d, key))
      notifyError(`Couldn’t restore the flag on ${item.question_id}: ${result.error}`)
      return
    }
    router.refresh()
  }, [router])

  const split = useMemo(() => partitionByDismissal(items, dismissed), [items, dismissed])
  const dismissedIds = useMemo(() => new Set(split.dismissed.map(i => i.question_id)), [split])
  const rows = showDismissed ? items : split.active

  const subjects = Array.from(new Set(items.map(i => i.main_subject).filter((s): s is string => Boolean(s)))).sort()
  const filters: FilterDef<ReviewItem>[] = [
    {
      id: 'flag', label: 'Flag', allLabel: 'Any flag',
      options: (Object.keys(FLAG_LABELS) as WeakOptionFlag[]).map(f => ({ value: f, label: FLAG_LABELS[f] })),
      predicate: (r, v) => r.flags.includes(v as WeakOptionFlag),
    },
    {
      id: 'subject', label: 'Subject', allLabel: 'All subjects',
      options: subjects.map(s => ({ value: s, label: s })),
      predicate: (r, v) => r.main_subject === v,
    },
  ]

  // Stable until the dismissed set changes, so memoised rows can skip re-rendering.
  const columns = useMemo<Column<ReviewItem>[]>(() => [
    {
      id: 'id',
      header: 'Question ID',
      sortValue: r => r.question_id,
      searchValue: r => r.question_id,
      cell: r => (
        <button
          type="button"
          onClick={() => setEditing(r)}
          className="whitespace-nowrap font-mono text-xs font-medium text-ink underline-offset-2 hover:underline"
        >
          {r.question_id}
        </button>
      ),
    },
    {
      id: 'subject',
      header: 'Subject / topic',
      sortValue: r => r.main_subject,
      searchValue: r => `${r.main_subject ?? ''} ${r.topic ?? ''}`,
      cell: r => (
        <span className="whitespace-nowrap text-xs">
          <span className="block text-ink">{r.main_subject ?? '—'}</span>
          <span className="block text-ink-muted">{r.topic ?? '—'}</span>
        </span>
      ),
    },
    {
      id: 'question',
      header: 'Question',
      searchValue: r => r.question_text,
      className: 'min-w-[14rem] max-w-xs',
      cell: r => r.question_text,
    },
    {
      id: 'options',
      header: 'Options',
      searchValue: r => r.options.join(' '),
      className: 'min-w-[12rem]',
      cell: r => (
        <ul className="space-y-0.5">
          {r.options.map((opt, i) => {
            const correct = i === r.correct_index
            return (
              <li
                key={i}
                data-correct={correct ? 'true' : undefined}
                className={`flex items-start gap-1 ${correct ? 'font-semibold text-ink' : 'text-ink-muted'}`}
              >
                {correct
                  ? <Icon name="check" size={14} className="mt-0.5 text-success" />
                  : <span aria-hidden="true" className="w-3.5 shrink-0" />}
                <span>
                  {letter(i)}. {opt}
                  {correct && <span className="sr-only">(correct answer)</span>}
                </span>
              </li>
            )
          })}
        </ul>
      ),
    },
    {
      id: 'flags',
      header: 'Flags',
      sortValue: r => r.flags.length,
      cell: r => (
        <span className="flex flex-wrap gap-1">
          {dismissedIds.has(r.question_id) && <Badge tone="neutral">Dismissed</Badge>}
          {r.flags.map(f => <Badge key={f} tone="warning">{FLAG_LABELS[f]}</Badge>)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: r => {
        const isDismissed = dismissedIds.has(r.question_id)
        return (
          <span className="inline-flex items-center gap-1">
            <IconButton icon="pencil" label={`Edit question ${r.question_id}`} onClick={() => setEditing(r)} />
            {isDismissed ? (
              <Button size="sm" variant="ghost" aria-label={`Restore flag on ${r.question_id}`} onClick={() => restore(r)}>
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="ghost" icon="check" aria-label={`Dismiss flag on ${r.question_id}`} onClick={() => dismiss(r)}>
                Dismiss
              </Button>
            )}
          </span>
        )
      },
    },
  ], [dismissedIds, dismiss, restore])

  return (
    <>
      <div className={TABLE_FRAME}>
        <div role="status" aria-live="polite">
          {lastDismissed && (
            <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-surface-3 px-4 py-2 text-ui text-ink">
              <span>Dismissed the flag on <span className="font-mono">{lastDismissed.question_id}</span> for everyone.</span>
              <Button size="sm" variant="ghost" onClick={() => restore(lastDismissed)}>Undo</Button>
            </div>
          )}
        </div>
        <DataTable
          label="Flagged questions"
          rows={rows}
          columns={columns}
          rowKey={r => r.question_id}
          filters={filters}
          searchPlaceholder="Search ID, subject, question or options"
          pageSize={50}
          emptyTitle={items.length === 0 ? 'No flagged questions' : 'Every flag is dismissed'}
          emptyDescription={
            items.length === 0
              ? 'Every scanned question passes the option heuristics. Questions land here when an import or edit leaves a giveaway option.'
              : 'The team has dismissed every flag. Show dismissed to review them again.'
          }
          toolbar={
            <Button
              size="sm"
              variant="secondary"
              aria-pressed={showDismissed}
              disabled={split.dismissed.length === 0 && !showDismissed}
              onClick={() => setShowDismissed(v => !v)}
            >
              {showDismissed ? 'Hide dismissed' : 'Show dismissed'} ({split.dismissed.length})
            </Button>
          }
        />
      </div>

      {editing && (
        <QuestionEditDrawer
          key={editing.question_id}
          question={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
