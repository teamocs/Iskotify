import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'

export const dynamic = 'force-dynamic'

const STATUS_STYLES = {
  ok:    'bg-success-soft text-success-strong',
  warn:  'bg-warning-soft text-warning-strong',
  error: 'bg-danger-soft text-danger-strong'
}

export default async function SyncPage() {
  const db = createServerClient()
  const { data: logs } = await db
    .from('sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <>
      <Topbar title="Sync Logs" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-surface-3">
                {['Time', 'Synced', 'Skipped', 'Closed', 'Status', 'Message'].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-ink-subtle uppercase tracking-wider border-b border-black/[0.05]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log: any) => (
                <tr key={log.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-ink-muted whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('en-PH')}
                  </td>
                  <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] font-medium text-ink">{log.synced}</td>
                  <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-ink-muted">{log.skipped}</td>
                  <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-ink-muted">{log.closed}</td>
                  <td className="px-5 py-3 border-b border-black/[0.04]">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[log.status as keyof typeof STATUS_STYLES]}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-ink-subtle">{log.message ?? '—'}</td>
                </tr>
              ))}
              {(!logs || logs.length === 0) && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-ink-subtle">
                    No sync history yet. Click "Sync Now" on the listings page to run the first sync.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
