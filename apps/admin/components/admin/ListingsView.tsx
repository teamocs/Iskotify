'use client'

import Link from 'next/link'
import type { Listing } from '@iskotify/utils'
import { ListingTable } from './ListingTable'
import type { SyncLog } from './SyncPanel'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

interface Props {
  listings: Listing[]
  logs: SyncLog[]
  total: number
  active: number
  upcoming: number
  lastSync: string | null
  health: { label: string; tone: BadgeTone }
}

function Figure({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="group flex items-baseline gap-2 rounded-sm px-2 py-1 -mx-2 hover:bg-surface-hover">
      <span className="font-heading text-lg font-semibold tabular-nums text-ink">{value}</span>
      <span className="text-ui text-ink-muted group-hover:text-ink group-hover:underline underline-offset-2">{label}</span>
    </Link>
  )
}

/**
 * Listings: a one-line summary strip (each count sets the status filter), then
 * the table. The table comes first in the reading order that matters — the
 * summary is one row, not four cards.
 */
export function ListingsView({ listings, total, active, upcoming, lastSync, health }: Props) {
  const syncTime = lastSync
    ? new Date(lastSync).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-subtle bg-surface px-4 py-2.5">
        <Figure label="Total" value={total} href="?" />
        <Figure label="Active" value={active} href="?status=active" />
        <Figure label="Upcoming" value={upcoming} href="?status=upcoming" />
        <Link href="/admin/sync" className="ml-auto flex items-center gap-2 text-ui text-ink-muted hover:text-ink">
          <span>Last sync{syncTime ? ` ${syncTime}` : ''}</span>
          <Badge tone={health.tone}>{health.label}</Badge>
        </Link>
      </div>
      <ListingTable listings={listings} />
    </div>
  )
}
