'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { PublishModal } from './PublishModal'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, buttonClass } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { errorMessage } from '@/lib/errorMessage'

export interface Draft {
  topic_id: string
  topic_name: string
  subject_id: string | null
  subject_name: string
  source_type: 'csv' | 'pdf' | 'manual' | 'ai'
  created_at: string
  total_cards: number
  cards_with_options: number
  cards_enhanced: number
  cards_needing_enhancement: number
}

const SOURCE: Record<Draft['source_type'], { label: string; tone: BadgeTone }> = {
  csv: { label: 'CSV', tone: 'info' },
  pdf: { label: 'PDF', tone: 'warning' },
  manual: { label: 'Manual', tone: 'neutral' },
  ai: { label: 'AI', tone: 'brand' },
}

const readyCount = (d: Draft) => d.cards_with_options + d.cards_enhanced
const isComplete = (d: Draft) => d.cards_needing_enhancement === 0

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const FILTERS: FilterDef<Draft>[] = [
  {
    id: 'source', label: 'Source', allLabel: 'Any source',
    options: (Object.keys(SOURCE) as Draft['source_type'][]).map(s => ({ value: s, label: SOURCE[s].label })),
    predicate: (d, v) => d.source_type === v,
  },
  {
    id: 'distractors', label: 'Distractors', allLabel: 'Any state',
    options: [{ value: 'complete', label: 'Complete' }, { value: 'pending', label: 'Still generating' }],
    predicate: (d, v) => (v === 'complete' ? isComplete(d) : !isComplete(d)),
  },
]

const COLUMNS: Column<Draft>[] = [
  {
    id: 'topic',
    header: 'Topic',
    sortValue: d => d.topic_name,
    searchValue: d => `${d.topic_name} ${d.subject_name}`,
    cell: d => (
      <Link
        href={`/admin/flashcards/review/${d.topic_id}`}
        className="font-medium text-ink underline-offset-2 hover:underline"
      >
        {d.topic_name}
      </Link>
    ),
  },
  { id: 'subject', header: 'Subject', sortValue: d => d.subject_name, cell: d => <span className="text-ink-muted">{d.subject_name}</span> },
  { id: 'cards', header: 'Cards', align: 'right', sortValue: d => d.total_cards, cell: d => d.total_cards },
  { id: 'distractors', header: 'Distractors', sortValue: d => (d.total_cards ? readyCount(d) / d.total_cards : 1), cell: d => <DistractorsCell draft={d} /> },
  { id: 'source', header: 'Source', sortValue: d => d.source_type, cell: d => <Badge tone={SOURCE[d.source_type]?.tone}>{SOURCE[d.source_type]?.label ?? d.source_type}</Badge> },
  {
    id: 'imported',
    header: 'Imported',
    sortValue: d => new Date(d.created_at),
    cell: d => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(d.created_at)}</span>,
  },
]

/**
 * The drafts table as a pure view: data, selection and the bulk action come in
 * as props so it renders the same in tests as in the page.
 */
export function DraftsTableView({ drafts, error, selected, onSelectedChange, onPublishSelected, onRetry }: {
  /** null while the first load is in flight. */
  drafts: Draft[] | null
  error: string | null
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  onPublishSelected: () => void
  onRetry: () => void
}) {
  if (error && drafts === null) {
    return (
      <ErrorBanner
        title="Couldn’t load drafts"
        message={error}
        action={<Button size="sm" onClick={onRetry}>Try again</Button>}
      />
    )
  }

  const count = selected.length
  return (
    <div className="space-y-3">
      {error && (
        <ErrorBanner
          title="Couldn’t refresh drafts"
          message={`${error}. The list below may be out of date.`}
          action={<Button size="sm" onClick={onRetry}>Try again</Button>}
        />
      )}
      <div className="overflow-hidden rounded-md border border-subtle bg-surface">
        <DataTable
          label="Drafts"
          rows={drafts ?? []}
          loading={drafts === null}
          columns={COLUMNS}
          rowKey={d => d.topic_id}
          filters={FILTERS}
          searchPlaceholder="Search topic or subject"
          pageSize={50}
          defaultSort={{ id: 'imported', dir: 'desc' }}
          emptyTitle="No drafts to publish"
          emptyDescription="Topics land here as drafts after a CSV import, a PDF extraction or a manual add. Import a CSV to get started."
          emptyAction={<Link href="/admin/upcat/import" className={buttonClass({ size: 'sm' })}>Import a CSV</Link>}
          selection={{
            selected,
            onChange: onSelectedChange,
            rowLabel: d => d.topic_name,
            actions: (
              <Button size="sm" variant="primary" onClick={onPublishSelected}>
                {`Publish ${plural(count, 'draft')}`}
              </Button>
            ),
          }}
        />
      </div>
    </div>
  )
}

export function DraftsTable() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkModalOpen, setBulkModalOpen] = useState(false)

  // Manual reloads (retry, after bulk publish) can overlap the 5s poll; only
  // the newest request may write state.
  const fetchCountRef = useRef(0)
  // Whether any topic is still enhancing; read by the poll, so the poll never
  // runs side effects inside a state updater.
  const pendingRef = useRef(false)
  useEffect(() => {
    pendingRef.current = drafts?.some(d => d.cards_needing_enhancement > 0) ?? false
  }, [drafts])

  async function fetchDrafts() {
    const id = ++fetchCountRef.current
    try {
      const res = await fetch('/api/flashcards/drafts')
      const body = await res.json()
      if (id !== fetchCountRef.current) return
      if (!res.ok) throw new Error(body.error ?? 'Failed to load drafts')
      setError(null)
      setDrafts(body.drafts)
    } catch (e) {
      if (id !== fetchCountRef.current) return
      setError(errorMessage(e, 'Failed to load drafts'))
    }
  }

  useEffect(() => {
    // Initial load plus a poll while cards are enhancing. State is only set once
    // a response arrives (see fetchDrafts); the rule can't see past the call.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDrafts()
    const iv = setInterval(() => {
      if (pendingRef.current) fetchDrafts()
    }, 5000)
    return () => clearInterval(iv)
  }, [])

  function handleBulkPublished(publishedTopicIds: string[]) {
    // Remove published topics from local state without waiting for a poll
    setDrafts(curr => curr?.filter(d => !publishedTopicIds.includes(d.topic_id)) ?? null)
    setSelectedIds([])
    setBulkModalOpen(false)
    fetchDrafts()  // re-sync just in case
  }

  const selectedCount = selectedIds.length

  return (
    <>
      <DraftsTableView
        drafts={drafts}
        error={error}
        selected={selectedIds}
        onSelectedChange={setSelectedIds}
        onPublishSelected={() => setBulkModalOpen(true)}
        onRetry={() => { setError(null); fetchDrafts() }}
      />

      <PublishModal
        open={bulkModalOpen}
        title={`Publish ${plural(selectedCount, 'draft')}`}
        description={
          `Pick at least one exam/scholarship. All cards across the ${selectedCount} selected topic` +
          `${selectedCount === 1 ? '' : 's'} will be tagged with the same slugs and marked published.`
        }
        topicIds={selectedIds}
        onClose={() => setBulkModalOpen(false)}
        onPublished={handleBulkPublished}
        primaryLabel={`Publish ${plural(selectedCount, 'draft')}`}
      />
    </>
  )
}

function DistractorsCell({ draft }: { draft: Draft }) {
  const ready = readyCount(draft)
  if (isComplete(draft)) {
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-success">
        <Icon name="check" size={14} />
        Complete <span className="tabular-nums">({ready}/{draft.total_cards})</span>
      </span>
    )
  }
  const pct = draft.total_cards ? Math.round((ready / draft.total_cards) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={`Distractors for ${draft.topic_name}`}
        aria-valuemin={0}
        aria-valuemax={draft.total_cards}
        aria-valuenow={ready}
        className="h-1.5 w-24 overflow-hidden rounded-pill bg-neutral-soft"
      >
        <div className="h-full bg-maroon transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-ink-muted">{ready}/{draft.total_cards}</span>
    </div>
  )
}
