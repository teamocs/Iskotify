import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { KbDriveSyncPanel, type KbDriveFile } from '@/components/admin/KbDriveSyncPanel'
import { SyncLogTable } from '@/components/admin/SyncLogTable'
import type { SyncLog } from '@/lib/admin/syncLog'
import { Card } from '@/components/ui/Card'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

export const dynamic = 'force-dynamic'

export default async function SyncPage() {
  const db = createServerClient()
  const { data: logs, error: logsError } = await db
    .from('sync_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  // Missing table (migration 055 not applied yet) just renders the empty state.
  const { data: kbFiles } = await db
    .from('kb_drive_files')
    .select('drive_file_id, name, path, status, dialect, rows_total, rows_imported, rows_missing_media, rows_drafted, message, imported_at, published_at, updated_at')
    .order('name')

  return (
    <>
      <Topbar title="Sync logs" />
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <KbDriveSyncPanel files={(kbFiles ?? []) as KbDriveFile[]} />
        <Card id="sync-history" title="Listings sync history" description="The last 100 Google Sheets syncs." flush>
          {logsError ? (
            <div className="p-4"><ErrorBanner title="Couldn’t load the sync history" message={logsError.message} /></div>
          ) : (
            <SyncLogTable logs={(logs ?? []) as SyncLog[]} />
          )}
        </Card>
      </div>
    </>
  )
}
