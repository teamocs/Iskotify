'use client'

import Link from 'next/link'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { buttonClass } from '@/components/ui/Button'

export interface BlueprintRow {
  slug: string
  name: string
  acronym: string
  total_items: number
  total_time_minutes: number
  status: string
  display_order: number
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  published: { label: 'Published', tone: 'success' },
  draft: { label: 'Draft', tone: 'neutral' },
}
const status = (s: string) => STATUS[s] ?? { label: s, tone: 'neutral' as const }

const FILTERS: FilterDef<BlueprintRow>[] = [
  {
    id: 'status', label: 'Status', allLabel: 'Any status',
    options: [{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }],
    predicate: (b, v) => b.status === v,
  },
]

const editHref = (b: BlueprintRow) => `/admin/exam-blueprints/${encodeURIComponent(b.slug)}`

const columns: Column<BlueprintRow>[] = [
  {
    id: 'name',
    header: 'Exam',
    sortValue: b => b.name,
    searchValue: b => `${b.name} ${b.acronym} ${b.slug}`,
    cell: b => (
      <Link href={editHref(b)} className="font-medium text-ink underline-offset-2 hover:underline">
        {b.name || b.slug}
      </Link>
    ),
  },
  { id: 'acronym', header: 'Acronym', sortValue: b => b.acronym, cell: b => <span className="text-ink-muted">{b.acronym || '—'}</span> },
  { id: 'items', header: 'Items', align: 'right', sortValue: b => b.total_items, cell: b => <span className="tabular-nums">{b.total_items}</span> },
  {
    id: 'time',
    header: 'Time limit',
    align: 'right',
    sortValue: b => b.total_time_minutes,
    cell: b => <span className="whitespace-nowrap tabular-nums text-ink-muted">{b.total_time_minutes} min</span>,
  },
  { id: 'status', header: 'Status', sortValue: b => status(b.status).label, cell: b => <Badge tone={status(b.status).tone}>{status(b.status).label}</Badge> },
  { id: 'order', header: 'Order', align: 'right', sortValue: b => b.display_order, cell: b => <span className="tabular-nums text-ink-muted">{b.display_order}</span> },
  {
    id: 'actions',
    header: 'Actions',
    hideHeader: true,
    align: 'right',
    cell: b => (
      <Link href={editHref(b)} aria-label={`Edit ${b.name || b.slug}`} className={buttonClass({ variant: 'ghost', size: 'sm' })}>
        Edit
      </Link>
    ),
  },
]

export function BlueprintsTable({ blueprints }: { blueprints: BlueprintRow[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface">
      <DataTable
        label="Exam blueprints"
        rows={blueprints}
        columns={columns}
        rowKey={b => b.slug}
        filters={FILTERS}
        searchPlaceholder="Search exam name or acronym"
        defaultSort={{ id: 'order', dir: 'asc' }}
        emptyTitle="No exam blueprints yet"
        emptyDescription="A blueprint sets an exam's sections, timing and scoring. Create one with New blueprint."
        emptyAction={<Link href="/admin/exam-blueprints/new" className={buttonClass({ variant: 'secondary', size: 'sm' })}>New blueprint</Link>}
      />
    </div>
  )
}
