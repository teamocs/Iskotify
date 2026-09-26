'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { ListingDrawer } from './ListingDrawer'
import { ConfirmDialog } from './ConfirmDialog'
import { useRouter } from 'next/navigation'
import { deleteListing } from '@/lib/admin/listingsApi'
import { notifySuccess, notifyError } from '@/lib/toast'
import { RowActions } from '@/components/ui/RowActions'
import { TABLE_FRAME } from '@/components/ui/Table'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

const TYPE: Record<Listing['type'], { label: string; tone: BadgeTone }> = {
  scholarship: { label: 'Scholarship', tone: 'brand' },
  exam: { label: 'Exam', tone: 'info' },
}

const STATUS: Record<Listing['status'], { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'success' },
  upcoming: { label: 'Upcoming', tone: 'warning' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })

const FILTERS: FilterDef<Listing>[] = [
  {
    id: 'type', label: 'Type', allLabel: 'All types',
    options: [{ value: 'scholarship', label: 'Scholarship' }, { value: 'exam', label: 'Exam' }],
    predicate: (l, v) => l.type === v,
  },
  {
    id: 'status', label: 'Status', allLabel: 'Any status',
    options: [{ value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'closed', label: 'Closed' }],
    predicate: (l, v) => l.status === v,
  },
]

export function ListingTable({ listings }: { listings: Listing[] }) {
  const [drawerListing, setDrawerListing] = useState<Listing | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null)
  const router = useRouter()

  async function handleDelete(listing: Listing) {
    const result = await deleteListing(listing.id)
    if (!result.ok) {
      notifyError(result.error)
      return
    }
    setDeleteTarget(null)
    notifySuccess('Listing deleted')
    router.refresh()
  }

  const columns: Column<Listing>[] = [
    {
      id: 'title',
      header: 'Listing',
      sortValue: l => l.title,
      searchValue: l => `${l.title} ${l.provider ?? ''} ${l.region ?? ''}`,
      cell: l => (
        <>
          <button
            type="button"
            onClick={() => setDrawerListing(l)}
            className="text-left font-medium text-ink underline-offset-2 hover:underline"
          >
            {l.title}
          </button>
          {l.provider && <span className="block text-xs text-ink-muted">{l.provider}</span>}
        </>
      ),
    },
    { id: 'type', header: 'Type', sortValue: l => l.type, cell: l => <Badge tone={TYPE[l.type]?.tone}>{TYPE[l.type]?.label ?? l.type}</Badge> },
    { id: 'status', header: 'Status', sortValue: l => l.status, cell: l => <Badge tone={STATUS[l.status]?.tone}>{STATUS[l.status]?.label ?? l.status}</Badge> },
    { id: 'region', header: 'Region', sortValue: l => l.region, cell: l => <span className="text-ink-muted">{l.region || '—'}</span> },
    {
      id: 'deadline',
      header: 'Deadline',
      sortValue: l => (l.deadline ? new Date(l.deadline) : null),
      cell: l => <span className="whitespace-nowrap tabular-nums text-ink-muted">{l.deadline ? fmtDate(l.deadline) : '—'}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: l => (
        <RowActions
          label={`Actions for ${l.title}`}
          items={[
            { label: 'Edit', name: `Edit ${l.title}`, icon: 'pencil', onSelect: () => setDrawerListing(l) },
            { label: 'Delete', name: `Delete ${l.title}`, icon: 'trash', tone: 'danger', onSelect: () => setDeleteTarget(l) },
          ]}
        />
      ),
    },
  ]

  return (
    <>
      <div className={TABLE_FRAME}>
        <DataTable
          label="Listings"
          rows={listings}
          columns={columns}
          rowKey={l => l.id}
          filters={FILTERS}
          searchPlaceholder="Search title, provider or region"
          pageSize={50}
          emptyTitle="No listings yet"
          emptyDescription="Run a sync to pull listings from the master sheet, or add one by hand."
          toolbar={<Button variant="primary" size="sm" icon="plus" onClick={() => setDrawerListing('new')}>Add listing</Button>}
        />
      </div>

      {drawerListing !== null && (
        <ListingDrawer
          listing={drawerListing === 'new' ? null : drawerListing}
          onClose={() => setDrawerListing(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
