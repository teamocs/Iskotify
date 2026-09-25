'use client'

import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { SendApkButton } from './SendApkButton'

export interface EarlyAccessRegistration {
  id: string
  full_name: string | null
  email: string
  school: string | null
  grade_level: string | null
  platform: string | null
  status: string
  created_at: string
}

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  approved: { label: 'Approved', tone: 'info' },
  sent: { label: 'Sent', tone: 'success' },
  expired: { label: 'Expired', tone: 'danger' },
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function EarlyAccessTable({ rows }: { rows: EarlyAccessRegistration[] }) {
  const platforms = Array.from(new Set(rows.map(r => r.platform).filter((p): p is string => Boolean(p)))).sort()

  const filters: FilterDef<EarlyAccessRegistration>[] = [
    {
      id: 'status', label: 'Status', allLabel: 'Any status',
      options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
      predicate: (r, v) => r.status === v,
    },
    ...(platforms.length > 1
      ? [{
          id: 'platform', label: 'Platform', allLabel: 'Any platform',
          options: platforms.map(p => ({ value: p, label: capitalise(p) })),
          predicate: (r: EarlyAccessRegistration, v: string) => r.platform === v,
        }]
      : []),
  ]

  const columns: Column<EarlyAccessRegistration>[] = [
    {
      id: 'email', header: 'Email',
      sortValue: r => r.email,
      searchValue: r => `${r.email} ${r.full_name ?? ''} ${r.school ?? ''}`,
      cell: r => <span className="font-medium text-ink break-all">{r.email}</span>,
    },
    { id: 'name', header: 'Name', sortValue: r => r.full_name, cell: r => <span className="text-ink-muted">{r.full_name || '—'}</span> },
    { id: 'school', header: 'School', sortValue: r => r.school, cell: r => <span className="text-ink-muted">{r.school || '—'}</span> },
    { id: 'grade', header: 'Grade level', sortValue: r => r.grade_level, cell: r => <span className="whitespace-nowrap text-ink-muted">{r.grade_level || '—'}</span> },
    {
      id: 'status', header: 'Status', sortValue: r => r.status,
      cell: r => <Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? capitalise(r.status)}</Badge>,
    },
    {
      id: 'registered', header: 'Registered',
      sortValue: r => new Date(r.created_at),
      cell: r => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(r.created_at)}</span>,
    },
    {
      id: 'actions', header: 'Actions', hideHeader: true, align: 'right',
      cell: r => (r.status !== 'expired' ? <SendApkButton id={r.id} status={r.status} recipient={r.email} /> : null),
    },
  ]

  return (
    <DataTable
      label="Registrations"
      rows={rows}
      columns={columns}
      rowKey={r => r.id}
      filters={filters}
      searchPlaceholder="Search email, name or school"
      pageSize={50}
      defaultSort={{ id: 'registered', dir: 'desc' }}
      emptyTitle="No early-access registrations yet"
      emptyDescription="Registrations from the early-access sign-up form appear here. Send each one the APK link once it is set above."
    />
  )
}
