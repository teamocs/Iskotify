import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabase'
import { createServerClient } from '@iskotify/utils'
import { Sidebar } from '@/components/admin/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.getUser()

  if (!user) redirect('/admin/login')

  const db = createServerClient()
  const { data: profile } = await db
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="text-center">
          <p className="text-4xl font-heading font-bold text-[#1d1d1f] mb-2">403</p>
          <p className="text-[#6e6e73]">Your account does not have admin access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
      <Sidebar userEmail={user.email ?? ''} />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  )
}
