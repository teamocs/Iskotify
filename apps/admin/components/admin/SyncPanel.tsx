import Link from 'next/link'

export interface SyncLog {
  id: number
  synced: number
  skipped: number
  closed: number
  status: 'ok' | 'warn' | 'error'
  message: string | null
  created_at: string
}

interface Props {
  logs: SyncLog[]
}

const STATUS_STYLES = {
  ok:    'bg-success-soft text-success-strong',
  warn:  'bg-warning-soft text-warning-strong',
  error: 'bg-danger-soft text-danger-strong'
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function SyncPanel({ logs }: Props) {
  const latest = logs[0]
  const isHealthy = !latest || (Date.now() - new Date(latest.created_at).getTime()) < 12 * 3600_000

  return (
    <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.05]">
        <div>
          <p className="font-heading font-bold text-[15px] text-ink">Google Sheets Sync</p>
          <p className="text-[11px] text-ink-subtle">
            {latest ? `Last run: ${timeAgo(latest.created_at)}` : 'Never synced'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={`w-2 h-2 rounded-full ${isHealthy ? 'bg-success shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-warning'}`} />
          {isHealthy ? 'Healthy' : 'Stale'}
        </div>
      </div>
      <div>
        {logs.length === 0 && (
          <p className="px-5 py-4 text-sm text-ink-subtle">No sync history yet.</p>
        )}
        {logs.map(log => (
          <div key={log.id} className="flex items-center gap-3 px-5 py-2.5 border-b border-black/[0.04] last:border-0 text-[12px]">
            <span className="text-ink-subtle w-14 flex-shrink-0">{timeAgo(log.created_at)}</span>
            <span className="text-ink-muted flex-1">
              {log.message ?? `${log.synced} synced · ${log.skipped} skipped · ${log.closed} closed`}
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLES[log.status]}`}>
              {log.status}
            </span>
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 border-t border-black/[0.04]">
        <Link href="/admin/sync" className="text-[12px] text-maroon font-medium hover:underline">
          View full log →
        </Link>
      </div>
    </div>
  )
}
