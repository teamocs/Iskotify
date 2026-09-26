'use client'

import { useMemo } from 'react'
import { TABLE_FRAME } from '@/components/ui/Table'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { DateContributionActions } from './DateContributionActions'

export interface Contribution {
  id: string
  listing_slug: string
  field: string
  suggested_date: string | null
  note: string | null
  source_url: string | null
  status: string
  created_at: string | null
}

const FIELD_LABELS: Record<string, string> = {
  exam_date: 'Exam date',
  deadline: 'Deadline',
  results_date: 'Results date',
}

const STATUS: Record<string, { label: string; tone: BadgeTone; rank: number }> = {
  pending: { label: 'Pending', tone: 'warning', rank: 0 },
  approved: { label: 'Approved', tone: 'success', rank: 1 },
  rejected: { label: 'Rejected', tone: 'neutral', rank: 2 },
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const FILTERS: FilterDef<Contribution>[] = [
  {
    id: 'status', label: 'Status', allLabel: 'Any status',
    options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
    predicate: (r, v) => r.status === v,
  },
  {
    id: 'field', label: 'Date type', allLabel: 'Any type',
    options: Object.entries(FIELD_LABELS).map(([value, label]) => ({ value, label })),
    predicate: (r, v) => r.field === v,
  },
]

export function DateContributionsTable({ rows, titles }: { rows: Contribution[]; titles: Record<string, string> }) {
  const columns = useMemo<Column<Contribution>[]>(() => {
    const title = (r: Contribution) => titles[r.listing_slug] ?? r.listing_slug
    return [
      {
        id: 'listing', header: 'Listing',
        sortValue: title,
        searchValue: r => `${title(r)} ${r.listing_slug} ${r.note ?? ''}`,
        cell: r => (
          <>
            <span className="font-medium text-ink">{title(r)}</span>
            {titles[r.listing_slug] && <span className="block text-xs text-ink-muted">{r.listing_slug}</span>}
          </>
        ),
      },
      {
        id: 'field', header: 'Date type', sortValue: r => FIELD_LABELS[r.field] ?? r.field,
        cell: r => <span className="whitespace-nowrap text-ink-muted">{FIELD_LABELS[r.field] ?? r.field}</span>,
      },
      {
        id: 'suggested', header: 'Suggested date',
        sortValue: r => (r.suggested_date ? new Date(r.suggested_date) : null),
        cell: r => <span className="whitespace-nowrap font-medium tabular-nums text-ink">{fmtDate(r.suggested_date)}</span>,
      },
      { id: 'note', header: 'Note', className: 'max-w-[15rem]', cell: r => <span className="text-ink-muted">{r.note || '—'}</span> },
      {
        id: 'source', header: 'Source',
        cell: r => r.source_url ? (
          <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="text-maroon underline">
            Open source<span className="sr-only"> for {title(r)} (opens in a new tab)</span>
          </a>
        ) : <span className="text-ink-muted">—</span>,
      },
      {
        id: 'status', header: 'Status', sortValue: r => STATUS[r.status]?.rank ?? 9,
        cell: r => <Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge>,
      },
      {
        id: 'submitted', header: 'Submitted',
        sortValue: r => (r.created_at ? new Date(r.created_at) : null),
        cell: r => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(r.created_at)}</span>,
      },
      {
        id: 'actions', header: 'Actions', hideHeader: true, align: 'right',
        cell: r => (r.status === 'pending' ? <DateContributionActions id={r.id} label={title(r)} /> : null),
      },
    ]
  }, [titles])

  return (
    <div className={TABLE_FRAME}>
      <DataTable
        label="Date corrections"
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        filters={FILTERS}
        searchPlaceholder="Search listing or note"
        pageSize={50}
        defaultSort={{ id: 'status', dir: 'asc' }}
        emptyTitle="No date corrections yet"
        emptyDescription="Students suggest exam, deadline and results dates from a listing in the app. Their suggestions wait here for review."
      />
    </div>
  )
}
