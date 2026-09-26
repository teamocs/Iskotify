'use client'

import { useMemo, useState } from 'react'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { TABLE_FRAME } from '@/components/ui/Table'
import { PageBody } from '@/components/ui/Page'
import type { ReviewStatus } from '@/lib/admin/bulkStatus'
import { FEEDBACK_QUEUE, QUEUE_PAGE_SIZE } from '@/lib/admin/queueSpecs'
import { ConfirmDialog } from './ConfirmDialog'
import { BulkStatusActions, ClampText, QueueRowActions, StatusBadge, fmtDate, statusFilter, useStatusQueue } from './StatusQueue'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AppFeedback {
  id: string
  user_id: string | null
  rating: number | null
  message: string | null
  status: ReviewStatus
  created_at: string
  updated_at: string
}

const ratingOf = (r: AppFeedback) =>
  typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5 ? Math.round(r.rating) : 0

/** Stars are decoration; the "4 of 5" text carries the rating. */
function Stars({ rating }: { rating: number }) {
  if (!rating) return <span className="text-ink-subtle">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className="tracking-tight">
        <span className="text-warning">{'★'.repeat(rating)}</span>
        <span className="text-ink-subtle opacity-40">{'★'.repeat(5 - rating)}</span>
      </span>
      <span className="text-xs tabular-nums text-ink-muted">{rating} of 5</span>
    </span>
  )
}

const FILTERS: FilterDef<AppFeedback>[] = [
  statusFilter<AppFeedback>(),
  {
    id: 'rating',
    label: 'Rating',
    allLabel: 'Any rating',
    options: [
      ...[5, 4, 3, 2, 1].map(n => ({ value: String(n), label: `${n} of 5` })),
      { value: 'none', label: 'No rating' },
    ],
  },
]

const shortLabel = (r: AppFeedback) => {
  const t = (r.message || 'feedback without a message').trim()
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

// ── Table ───────────────────────────────────────────────────────────────────

interface ViewProps {
  /** The current page, as the server returned it (already searched, filtered and sorted). */
  rows: AppFeedback[]
  /** Rows matching the current search and filters, across every page. */
  total: number
  loading: boolean
  error: string
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  bulkBusy: boolean
  /** Outcome of the last bulk action, announced to screen readers. */
  bulkResult?: string
  onBulk: (status: ReviewStatus) => void
  onRetry: () => void
  onSetStatus: (id: string, status: ReviewStatus) => void
  onDelete: (r: AppFeedback) => void
}

export function FeedbackView({ rows, total, loading, error, selected, onSelectedChange, bulkBusy, bulkResult, onBulk, onRetry, onSetStatus, onDelete }: ViewProps) {
  // Memoised so a selection change re-renders only the rows whose checkbox flipped.
  const columns = useMemo<Column<AppFeedback>[]>(() => [
    {
      id: 'message',
      header: 'Message',
      searchValue: r => r.message ?? '',
      className: 'max-w-[32rem]',
      cell: r => <ClampText text={r.message || '—'} max={120} />,
    },
    { id: 'rating', header: 'Rating', sortValue: r => ratingOf(r), cell: r => <Stars rating={ratingOf(r)} /> },
    { id: 'status', header: 'Status', sortValue: r => r.status, cell: r => <StatusBadge status={r.status} /> },
    {
      id: 'submitted',
      header: 'Submitted',
      sortValue: r => new Date(r.created_at),
      cell: r => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(r.created_at)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: r => (
        <QueueRowActions
          name={shortLabel(r)}
          status={r.status}
          onSetStatus={s => onSetStatus(r.id, s)}
          onDelete={() => onDelete(r)}
          deleteLabel="Delete feedback"
        />
      ),
    },
  ], [onSetStatus, onDelete])

  return (
    <div className={TABLE_FRAME}>
      <DataTable
        error={error}
        onRetry={onRetry}
        announcement={bulkResult}
        label="Feedback"
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        filters={FILTERS}
        searchPlaceholder="Search feedback messages"
        pageSize={QUEUE_PAGE_SIZE}
        server={{ total }}
        defaultSort={FEEDBACK_QUEUE.defaultSort}
        loading={loading}
        emptyTitle="No feedback yet"
        emptyDescription="Ratings and comments that students send from the app’s feedback form show up here."
        selection={{
          selected,
          onChange: onSelectedChange,
          rowLabel: shortLabel,
          actions: <BulkStatusActions busy={bulkBusy} onApply={onBulk} />,
        }}
      />
    </div>
  )
}

// ── Main FeedbackManager ────────────────────────────────────────────────────

export function FeedbackManager() {
  const queue = useStatusQueue<AppFeedback>({
    listUrl: '/api/admin/feedback',
    spec: FEEDBACK_QUEUE,
    noun: { one: 'feedback item', many: 'feedback items' },
    singular: 'Feedback',
  })
  const [deleting, setDeleting] = useState<AppFeedback | null>(null)

  return (
    <PageBody intro="Ratings and comments from students. Mark items reviewed once read, resolved once acted on.">
      <FeedbackView
        rows={queue.rows}
        total={queue.total}
        loading={queue.loading}
        error={queue.error}
        selected={queue.selected}
        onSelectedChange={queue.setSelected}
        bulkBusy={queue.bulkBusy}
        bulkResult={queue.bulkResult}
        onBulk={queue.applyBulk}
        onRetry={queue.reload}
        onSetStatus={queue.setStatus}
        onDelete={setDeleting}
      />

      {deleting && (
        <ConfirmDialog
          message={`Delete this feedback (“${shortLabel(deleting)}”)? This cannot be undone.`}
          confirmLabel="Delete feedback"
          onConfirm={async () => { if (await queue.remove(deleting.id)) setDeleting(null) }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageBody>
  )
}
