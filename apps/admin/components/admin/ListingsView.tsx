'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { StatCard } from './StatCard'
import { SyncPanel } from './SyncPanel'
import { ListingTable } from './ListingTable'
import type { SyncLog } from './SyncPanel'

interface Props {
  listings: Listing[]
  logs: SyncLog[]
  total: number
  active: number
  upcoming: number
  lastSync: string | null
  health: { label: string; accent: string }
}

export function ListingsView({ listings, logs, total, active, upcoming, lastSync, health }: Props) {
  const [filter, setFilter] = useState('All')

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Listings"
          value={total}
          onClick={() => setFilter('All')}
          active={filter === 'All'}
        />
        <StatCard
          label="Active"
          value={active}
          accent="text-green-700"
          sub="Open for applications"
          onClick={() => setFilter('Active')}
          active={filter === 'Active'}
        />
        <StatCard
          label="Upcoming"
          value={upcoming}
          accent="text-amber-700"
          sub="Opening soon"
          onClick={() => setFilter('Upcoming')}
          active={filter === 'Upcoming'}
        />
        <StatCard
          label="Last Sync"
          value={lastSync ? new Date(lastSync).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}
          sub={health.label}
          accent={health.accent}
        />
      </div>
      <SyncPanel logs={logs} />
      <ListingTable listings={listings} filter={filter} onFilterChange={setFilter} />
    </div>
  )
}
