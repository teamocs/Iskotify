import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { ListingsView } from '@/components/admin/ListingsView'
import type { Listing } from '@iskotify/utils'
import type { SyncLog } from '@/components/admin/SyncPanel'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const [listingsRes, logsRes] = await Promise.all([
    db.from('listings').select('*').order('created_at', { ascending: false }),
    db.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(4)
  ])
  return {
    listings: (listingsRes.data ?? []) as Listing[],
    logs: (logsRes.data ?? []) as SyncLog[]
  }
}

export default async function ListingsPage() {
  const { listings, logs } = await getData()

  const total = listings.length
  const activeCount = listings.filter(l => l.status === 'active').length
  const upcomingCount = listings.filter(l => l.status === 'upcoming').length
  const lastSyncTime = logs[0]?.created_at ?? null

  function syncHealth() {
    if (!lastSyncTime) return { label: 'Never synced', accent: 'text-gray-400' }
    const hrs = (Date.now() - new Date(lastSyncTime).getTime()) / 3600_000
    if (hrs < 12) return { label: 'Healthy', accent: 'text-green-600' }
    if (hrs < 24) return { label: 'Stale', accent: 'text-amber-600' }
    return { label: 'Very stale', accent: 'text-red-600' }
  }

  const health = syncHealth()

  return (
    <>
      <Topbar title="All Listings" showSyncButton />
      <ListingsView
        listings={listings}
        logs={logs}
        total={total}
        active={activeCount}
        upcoming={upcomingCount}
        lastSync={lastSyncTime}
        health={health}
      />
    </>
  )
}
