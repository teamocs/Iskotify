import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { InboxView } from '@/components/admin/InboxView'
import { getInboxCounts, type InboxDb } from '@/lib/admin/inboxCounts'

export const dynamic = 'force-dynamic'

// The admin Home is a work inbox: what is waiting, and where to do it.
export default async function AdminHomePage() {
  let db: InboxDb | null = null
  try {
    db = createServerClient() as unknown as InboxDb
  } catch {
    // Missing server env: every count renders as unavailable, never as zero.
  }
  const counts = await getInboxCounts(db)

  return (
    <>
      <Topbar title="Home" />
      <InboxView counts={counts} now={Date.now()} />
    </>
  )
}
