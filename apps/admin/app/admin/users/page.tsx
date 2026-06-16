import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'

// Always reflect the live auth user list (it is cleared / changes over time).
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface UserRow {
  id: string
  email: string
  role: string
  created_at: string
  hasAppData: boolean
}

const ROLE_STYLES: Record<string, string> = {
  admin:   'bg-[#800000]/10 text-[#800000]',
  student: 'bg-blue-100 text-blue-800',
  user:    'bg-gray-100 text-gray-600',
}

async function getData(): Promise<{ rows: UserRow[]; error: string }> {
  const db = createServerClient()

  // Roles (to exclude admins + label everyone) and which users have cloud data.
  const [{ data: profiles }, { data: appData }] = await Promise.all([
    db.from('profiles').select('id,role'),
    db.from('user_app_data').select('user_id'),
  ])

  const roleById = new Map<string, string>()
  for (const p of (profiles ?? []) as { id: string; role: string | null }[]) {
    roleById.set(p.id, p.role ?? 'user')
  }
  const hasAppDataById = new Set<string>(
    ((appData ?? []) as { user_id: string }[]).map((r) => r.user_id),
  )

  // Pull the auth users via the service-role admin API (paginated).
  let authUsers: { id: string; email?: string | null; created_at?: string }[] = []
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
      hasAppData: hasAppDataById.has(u.id),
    }))
    // Exclude the admin account(s) from the list.
    .filter((u) => u.role !== 'admin')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  return { rows, error: '' }
}

function formatDate(iso: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return iso
  }
}

export default async function UsersPage() {
  const { rows, error } = await getData()

  return (
    <>
      <Topbar title="Users" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Current users</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">
            {rows.length} user{rows.length !== 1 ? 's' : ''} (excluding admin)
          </p>
        </div>

        {error ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>
        ) : null}

        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-[#fafafa]">
                  {['Email', 'Role', 'Joined', 'Has app data'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider border-b border-black/[0.05] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-black/[0.015] transition-colors">
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] font-medium text-[#1d1d1f]">{row.email}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${ROLE_STYLES[row.role] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-[#6e6e73] whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73]">
                      {row.hasAppData ? (
                        <span className="text-green-700 font-medium">Yes</span>
                      ) : (
                        <span className="text-[#aeaeb2]">No</span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !error && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
