import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'

export const dynamic = 'force-dynamic'

interface EarlyAccessRegistration {
  id: string
  full_name: string | null
  email: string
  school: string | null
  grade_level: string | null
  platform: string | null
  status: string
  created_at: string
}

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  sent:    'bg-green-100 text-green-800',
  expired: 'bg-red-100 text-red-800',
}

async function getData(): Promise<EarlyAccessRegistration[]> {
  const db = createServerClient()
  const { data } = await db
    .from('early_access_registrations')
    .select('id,full_name,email,school,grade_level,platform,status,created_at')
    .order('created_at', { ascending: false })
  return (data ?? []) as EarlyAccessRegistration[]
}

export default async function EarlyAccessPage() {
  const rows = await getData()

  return (
    <>
      <Topbar title="Early Access" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">Early-access registrations</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">
            {rows.length} registration{rows.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="bg-[#fafafa]">
                  {['Email', 'Name', 'School', 'Grade', 'Status', 'Registered'].map(h => (
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
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73]">{row.full_name || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73]">{row.school || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73] whitespace-nowrap">{row.grade_level || '—'}</td>
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-[#6e6e73] whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">
                      No early-access registrations yet.
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
