import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { InboxView } from '@/components/admin/InboxView'
import { getInboxCounts, type InboxDb } from '@/lib/admin/inboxCounts'
import { notFound } from 'next/navigation'
import { isAdminSession } from '@/lib/admin/requireAdmin'

export const dynamic = 'force-dynamic'

// The admin Home is a work inbox: what is waiting, and where to do it.
export default async function AdminHomePage() {
  // The layout's check doesn't stop this page's own service-role reads.
  if (!(await isAdminSession())) notFound()
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
      {/* Server component: rendered once per request, so reading the clock here is intended. */}
      {/* eslint-disable-next-line react-hooks/purity */}
      <InboxView counts={counts} now={Date.now()} />
    </>
  )
}
