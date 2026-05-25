import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabase'
import { createServerClient } from '@iskotify/utils'
import { AdminShell } from '@/components/admin/AdminShell'

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
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="text-center">
          <p className="text-4xl font-heading font-bold text-[#1d1d1f] mb-2">403</p>
          <p className="text-[#6e6e73]">Your account does not have admin access.</p>
        </div>
      </div>
    )
  }

  return <AdminShell userEmail={user.email ?? ''}>{children}</AdminShell>
}
