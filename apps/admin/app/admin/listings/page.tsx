import Link from 'next/link'
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { ListingsView } from '@/components/admin/ListingsView'
import { buttonClass } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import type { Listing } from '@iskotify/utils'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const [listingsRes, lastImportRes] = await Promise.all([
    db.from('listings').select('*').order('created_at', { ascending: false }),
    db.from('listing_import_batches').select('published_at').eq('status', 'published').order('published_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  return {
    listings: (listingsRes.data ?? []) as Listing[],
    lastImportTime: (lastImportRes.data?.published_at as string | undefined) ?? null,
  }
}

export default async function ListingsPage() {
  const { listings, lastImportTime } = await getData()

  const total = listings.length
  const activeCount = listings.filter(l => l.status === 'active').length
  const upcomingCount = listings.filter(l => l.status === 'upcoming').length

  return (
    <>
      <Topbar
        title="All listings"
        exportHref="/api/admin/listings/export"
        actions={
          <Link href="/admin/listings/import" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <Icon name="upload" />
            Import
          </Link>
        }
      />
      <ListingsView
        listings={listings}
        total={total}
        active={activeCount}
        upcoming={upcomingCount}
        lastImport={lastImportTime}
      />
    </>
  )
}
