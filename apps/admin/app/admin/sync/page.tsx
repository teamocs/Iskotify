import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { QuestionSyncView } from '@/components/admin/questionSync/QuestionSyncView'
import type { KbFileRow, PublishEventRow, SyncRunRow } from '@/components/admin/questionSync/types'

export const dynamic = 'force-dynamic'

const FILE_COLUMNS =
  'drive_file_id, name, path, status, dialect, mapping_source, rows_total, rows_imported, rows_missing_media, rows_drafted, rows_rejected, headers, message, imported_at, published_at, updated_at'

// Google Drive → question bank. Files move Needs attention → Preview → History;
// the Google Sheets listings import is a separate page (/admin/listings/import).
export default async function QuestionSyncPage() {
  const db = createServerClient()
  const [files, mappings, runs, events] = await Promise.all([
    db.from('kb_drive_files').select(FILE_COLUMNS).order('name'),
    db.from('kb_file_mappings').select('drive_file_id, subtest'),
    db.from('kb_sync_runs').select('*').order('started_at', { ascending: false }).limit(30),
    db.from('kb_publish_events').select('*').order('created_at', { ascending: false }).limit(200),
  ])

  const mapped = new Map(((mappings.data ?? []) as { drive_file_id: string; subtest: string }[]).map(m => [m.drive_file_id, m.subtest]))
  const rows = ((files.data ?? []) as KbFileRow[]).map(f => ({ ...f, mapped_subtest: mapped.get(f.drive_file_id) }))

  return (
    <>
      <Topbar title="Question sync" />
      <PageBody intro="Questions from the Iskotify Drive folder arrive as drafts. Preview each file and publish it; published files move to History.">
        {files.error ? (
          <ErrorBanner title="Couldn’t load the Drive files" message={files.error.message} />
        ) : (
          <QuestionSyncView
            files={rows}
            runs={(runs.data ?? []) as SyncRunRow[]}
            events={(events.data ?? []) as PublishEventRow[]}
          />
        )}
      </PageBody>
    </>
  )
}
