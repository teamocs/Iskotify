import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createAuthClient } from '@/lib/supabase'
import { createServerClient } from '@iskotify/utils'
import { AdminShell } from '@/components/admin/AdminShell'
import { SIDEBAR_COOKIE, parseSidebarMode } from '@/lib/nav/sidebarState'
import { loadNavBadges } from '@/lib/admin/navBadges'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user = null
  try {
    const auth = await createAuthClient()
    const { data } = await auth.auth.getUser()
    user = data.user
  } catch {
    redirect('/login')
  }

  if (!user) redirect('/login')

  let isAdmin = false
  try {
    const db = createServerClient()
    const { data: profile } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  } catch {
    // DB unavailable — deny access
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2">
        <div className="text-center">
          <p className="text-4xl font-heading font-bold text-ink mb-2">403</p>
          <p className="text-ink-muted">Your account does not have admin access.</p>
        </div>
      </div>
    )
  }

  // The rail is rendered from the cookie on the server: no expanded-then-collapsed flash.
  const defaultCollapsed = parseSidebarMode((await cookies()).get(SIDEBAR_COOKIE)?.value) === 'collapsed'
  // Not awaited: the shell streams now and the queue badges fill in when the counts land.
  const badges = loadNavBadges()

  return (
    <AdminShell userEmail={user.email ?? ''} defaultCollapsed={defaultCollapsed} badges={badges}>
      {children}
    </AdminShell>
  )
}
