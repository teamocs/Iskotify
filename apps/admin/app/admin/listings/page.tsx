import { createServerClient } from '@iskotify/utils'
import { StatCard } from '@/components/admin/StatCard'
import { SyncPanel } from '@/components/admin/SyncPanel'
import { ListingTable } from '@/components/admin/ListingTable'
import { Topbar } from '@/components/admin/Topbar'
import type { Listing } from '@iskotify/utils'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const [listingsRes, logsRes] = await Promise.all([
    db.from('listings').select('*').order('created_at', { ascending: false }),
    db.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(4)
  ])
  return {
    listings: (listingsRes.data ?? []) as Listing[],
    logs: logsRes.data ?? []
  }
}

export default async function ListingsPage() {
  const { listings, logs } = await getData()

  const total = listings.length
  const active = listings.filter(l => l.status === 'active').length
  const upcoming = listings.filter(l => l.status === 'upcoming').length
  const lastSync = logs[0]?.created_at

  function syncHealth() {
    if (!lastSync) return { label: 'Never synced', accent: 'text-gray-400' }
    const hrs = (Date.now() - new Date(lastSync).getTime()) / 3600_000
    if (hrs < 12) return { label: 'Healthy', accent: 'text-green-600' }
    if (hrs < 24) return { label: 'Stale', accent: 'text-amber-600' }
    return { label: 'Very stale', accent: 'text-red-600' }
  }

  const health = syncHealth()

  return (
    <>
      <Topbar title="All Listings" showSyncButton />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Listings" value={total} />
          <StatCard label="Active" value={active} accent="text-green-700" sub="Open for applications" />
          <StatCard label="Upcoming" value={upcoming} accent="text-amber-700" sub="Opening soon" />
          <StatCard
            label="Last Sync"
            value={lastSync ? new Date(lastSync).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}
            sub={health.label}
            accent={health.accent}
          />
        </div>
        <SyncPanel logs={logs as any} />
        <ListingTable listings={listings} />
      </div>
    </>
  )
}
