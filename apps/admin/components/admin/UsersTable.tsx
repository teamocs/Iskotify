'use client'

import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

export interface UserRow {
  id: string
  email: string
  role: string
  created_at: string
  confirmed: boolean
  hasAppData: boolean
}

const ROLE_TONE: Record<string, BadgeTone> = { student: 'info', user: 'neutral' }
const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1)

function fmtDate(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

const YES_NO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]

export function UsersTable({ rows }: { rows: UserRow[] }) {
  const roles = Array.from(new Set(rows.map(r => r.role))).sort()

  const filters: FilterDef<UserRow>[] = [
    {
      id: 'role', label: 'Role', allLabel: 'Any role',
      options: roles.map(r => ({ value: r, label: roleLabel(r) })),
      predicate: (r, v) => r.role === v,
    },
    {
      id: 'confirmed', label: 'Confirmed', allLabel: 'Either',
      options: YES_NO,
      predicate: (r, v) => r.confirmed === (v === 'yes'),
    },
    {
      id: 'appdata', label: 'App data', allLabel: 'Either',
      options: YES_NO,
      predicate: (r, v) => r.hasAppData === (v === 'yes'),
    },
  ]

  const columns: Column<UserRow>[] = [
    {
      id: 'email', header: 'Email',
      sortValue: r => r.email, searchValue: r => r.email,
      cell: r => <span className="font-medium text-ink break-all">{r.email}</span>,
    },
    {
      id: 'role', header: 'Role', sortValue: r => r.role,
      cell: r => <Badge tone={ROLE_TONE[r.role] ?? 'neutral'}>{roleLabel(r.role)}</Badge>,
    },
    {
      id: 'confirmed', header: 'Email confirmed', sortValue: r => r.confirmed,
      cell: r => (r.confirmed ? <Badge tone="success">Confirmed</Badge> : <Badge tone="warning">Unconfirmed</Badge>),
    },
    {
      id: 'joined', header: 'Joined',
      sortValue: r => (r.created_at ? new Date(r.created_at) : null),
      cell: r => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(r.created_at)}</span>,
    },
    {
      id: 'appdata', header: 'App data', sortValue: r => r.hasAppData,
      cell: r => <span className={r.hasAppData ? 'text-ink' : 'text-ink-muted'}>{r.hasAppData ? 'Saved in cloud' : 'None'}</span>,
    },
  ]

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface">
      <DataTable
        label="Users"
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        filters={filters}
        searchPlaceholder="Search by email"
        pageSize={50}
        defaultSort={{ id: 'joined', dir: 'desc' }}
        emptyTitle="No users yet"
        emptyDescription="Students appear here once they create an account in the Iskotify app. Admin accounts are not listed."
      />
    </div>
  )
}
