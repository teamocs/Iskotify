/** One row of `sync_logs`: a Google Sheets → listings sync run. */
export interface SyncLog {
  id: number
  synced: number
  skipped: number
  closed: number
  status: 'ok' | 'warn' | 'error'
  message: string | null
  created_at: string
}
