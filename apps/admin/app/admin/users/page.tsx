import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { UsersTable, type UserRow } from '@/components/admin/UsersTable'

// Always reflect the live auth user list (it is cleared / changes over time).
export const dynamic = 'force-dynamic'
export const revalidate = 0

async function getData(): Promise<{ rows: UserRow[]; error: string }> {
  const db = createServerClient()

  // Roles (to exclude admins + label everyone) and which users have cloud data.
  const [profilesRes, appDataRes] = await Promise.all([
    db.from('profiles').select('id,role'),
    db.from('user_app_data').select('user_id'),
  ])
  // Without roles we cannot tell admins apart, so fail loudly rather than list them.
  if (profilesRes.error) return { rows: [], error: profilesRes.error.message }

  const roleById = new Map<string, string>()
  for (const p of (profilesRes.data ?? []) as { id: string; role: string | null }[]) {
    roleById.set(p.id, p.role ?? 'user')
  }
  const hasAppDataById = new Set<string>(
    ((appDataRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  )

  // Pull the auth users via the service-role admin API (paginated).
  let authUsers: { id: string; email?: string | null; created_at?: string; email_confirmed_at?: string | null }[] = []
  try {
    const perPage = 1000
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage })
      if (error) return { rows: [], error: error.message }
      const batch = data?.users ?? []
      authUsers = authUsers.concat(batch)
      if (batch.length < perPage) break
    }
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : 'Failed to load users' }
  }

  const rows: UserRow[] = authUsers
    .map((u) => ({
      id: u.id,
      email: u.email ?? '—',
      role: roleById.get(u.id) ?? 'user',
      created_at: u.created_at ?? '',
      confirmed: Boolean(u.email_confirmed_at),
      hasAppData: hasAppDataById.has(u.id),
    }))
    // Exclude the admin account(s) from the list.
    .filter((u) => u.role !== 'admin')

  return { rows, error: '' }
}

export default async function UsersPage() {
  const { rows, error } = await getData()

  return (
    <>
      <Topbar title="Users" />
      <PageBody intro={error ? undefined : `${rows.length} account${rows.length !== 1 ? 's' : ''} in the app. Admin accounts are not listed.`}>
        {error ? (
          <ErrorBanner title="Couldn’t load users" message={error} />
        ) : (
          <UsersTable rows={rows} />
        )}
      </PageBody>
    </>
  )
}
