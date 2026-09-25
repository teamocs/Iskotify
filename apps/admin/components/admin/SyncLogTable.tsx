'use client'

import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import type { SyncLog } from './SyncPanel'

const STATUS: Record<SyncLog['status'], { label: string; tone: BadgeTone }> = {
  ok: { label: 'OK', tone: 'success' },
  warn: { label: 'Warnings', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
}

const COLUMNS: Column<SyncLog>[] = [
  {
    id: 'time', header: 'Time',
    sortValue: l => new Date(l.created_at),
    cell: l => <span className="whitespace-nowrap tabular-nums text-ink-muted">{new Date(l.created_at).toLocaleString('en-PH')}</span>,
  },
  { id: 'status', header: 'Status', sortValue: l => l.status, cell: l => <Badge tone={STATUS[l.status]?.tone ?? 'neutral'}>{STATUS[l.status]?.label ?? l.status}</Badge> },
  { id: 'synced', header: 'Synced', align: 'right', sortValue: l => l.synced, cell: l => <span className="font-medium">{l.synced}</span> },
  { id: 'skipped', header: 'Skipped', align: 'right', sortValue: l => l.skipped, cell: l => l.skipped },
  { id: 'closed', header: 'Closed', align: 'right', sortValue: l => l.closed, cell: l => l.closed },
  { id: 'message', header: 'Message', searchValue: l => l.message ?? '', cell: l => <span className="text-ink-muted">{l.message ?? '—'}</span> },
]

const FILTERS: FilterDef<SyncLog>[] = [
  {
    id: 'status', label: 'Status', allLabel: 'Any status',
    options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
    predicate: (l, v) => l.status === v,
  },
]

export function SyncLogTable({ logs }: { logs: SyncLog[] }) {
  return (
    <DataTable
      label="Sync runs"
      rows={logs}
      columns={COLUMNS}
      rowKey={l => String(l.id)}
      filters={FILTERS}
      paramPrefix="log_"
      defaultSort={{ id: 'time', dir: 'desc' }}
      searchPlaceholder="Search messages"
      emptyTitle="No sync history yet"
      emptyDescription="Use “Sync now” on the listings page to run the first sync."
    />
  )
}
