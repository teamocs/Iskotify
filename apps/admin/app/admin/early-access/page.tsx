import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { SendApkButton } from '@/components/admin/SendApkButton'

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

interface ApkStatus {
  present: boolean
  name: string
  size?: number
  updatedAt?: string
}

const STATUS_STYLES: Record<string, string> = {
  pending:  'bg-amber-100 text-amber-800',
  approved: 'bg-blue-100 text-blue-800',
  sent:     'bg-green-100 text-green-800',
  expired:  'bg-red-100 text-red-800',
}

async function getData(): Promise<{
  rows: EarlyAccessRegistration[]
  apk: ApkStatus
}> {
  const db = createServerClient()
  const objectKey = process.env.EARLY_ACCESS_APK_OBJECT ?? 'iskotify-early-access.apk'

  const [{ data }, { data: listData }] = await Promise.all([
    db
      .from('early_access_registrations')
      .select('id,full_name,email,school,grade_level,platform,status,created_at')
      .order('created_at', { ascending: false }),
    db.storage.from('early-access-apk').list('', { search: objectKey }),
  ])

  const rows = (data ?? []) as EarlyAccessRegistration[]

  // list() returns an array of FileObject; find an exact name match
  const match = Array.isArray(listData)
    ? (listData as Array<{ name: string; metadata?: { size?: number; lastModified?: string } }>)
        .find((f) => f.name === objectKey)
    : null

  const apk: ApkStatus = match
    ? {
        present: true,
        name: objectKey,
        size: match.metadata?.size,
        updatedAt: match.metadata?.lastModified,
      }
    : { present: false, name: objectKey }

  return { rows, apk }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function EarlyAccessPage() {
  const { rows, apk } = await getData()

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

        {/* APK status banner */}
        {apk.present ? (
          <div className="flex items-center gap-3 rounded-[12px] px-4 py-3 bg-green-50 border border-green-200">
            <span className="text-green-600 text-base leading-none" aria-hidden="true">&#10003;</span>
            <p className="text-[13px] text-green-800 font-medium">
              APK ready: <span className="font-mono">{apk.name}</span>
              {apk.size != null && (
                <span className="font-normal text-green-700 ml-2">({formatBytes(apk.size)})</span>
              )}
              {apk.updatedAt && (
                <span className="font-normal text-green-600 ml-2">
                  &mdash; updated {new Date(apk.updatedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              )}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-[12px] px-4 py-3 bg-amber-50 border border-amber-200">
            <span className="text-amber-500 text-base leading-none mt-0.5" aria-hidden="true">&#9888;</span>
            <p className="text-[13px] text-amber-800">
              No APK uploaded yet &mdash; upload{' '}
              <span className="font-mono font-semibold">{apk.name}</span>
              {' '}to the <span className="font-semibold">early-access-apk</span> bucket in Supabase Storage before sending emails.
            </p>
          </div>
        )}

        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-[#fafafa]">
                  {['Email', 'Name', 'School', 'Grade', 'Status', 'Registered', 'Actions'].map(h => (
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
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      {row.status !== 'expired' && (
                        <SendApkButton id={row.id} status={row.status} />
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">
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
