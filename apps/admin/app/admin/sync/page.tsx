import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { QuestionSyncView } from '@/components/admin/questionSync/QuestionSyncView'
import type { KbFileRow, PublishEventRow, SyncRunRow } from '@/components/admin/questionSync/types'
import { DriveSourcesPanel } from '@/components/admin/driveContent/DriveSourcesPanel'
import { DriveListingsCard } from '@/components/admin/driveContent/DriveListingsCard'
import { DriveAnnouncementsCard } from '@/components/admin/driveContent/DriveAnnouncementsCard'
import { CONTENT_FILE_COLUMNS, type ContentFileRow } from '@/components/admin/driveContent/types'
import { serviceAccountEmail } from '@/lib/google/serviceAccount'
import { HISTORY_COLUMNS, type ImportBatch, type ImportBatchSummary } from '@/lib/listings/types'
import { ANNOUNCEMENT_HISTORY_COLUMNS, type AnnouncementBatch, type AnnouncementBatchSummary } from '@/lib/announcements/types'
import { isFolderId, type DriveSourceRow } from '@/lib/driveSources/sources'

export const dynamic = 'force-dynamic'

const FILE_COLUMNS =
  'drive_file_id, name, path, status, dialect, mapping_source, rows_total, rows_imported, rows_missing_media, rows_drafted, rows_rejected, headers, message, imported_at, published_at, updated_at'

// Google Drive → the app. Questions files move Needs attention → Preview →
// History (unchanged); listings sheets and announcement report Docs from the
// Drive sources below get their own previews. Nothing goes live without an
// admin's Publish. The pasted-link listings import is /admin/listings/import.
export default async function DriveSyncPage() {
  const db = createServerClient()
  const [files, mappings, runs, events, sources, listingPreviews, listingHistory, annPreviews, annHistory, contentFiles] = await Promise.all([
    db.from('kb_drive_files').select(FILE_COLUMNS).order('name'),
    db.from('kb_file_mappings').select('drive_file_id, subtest'),
    db.from('kb_sync_runs').select('*').order('started_at', { ascending: false }).limit(30),
    db.from('kb_publish_events').select('*').order('created_at', { ascending: false }).limit(200),
    db.from('drive_sources').select('id, content_type, folder_id, label, enabled, created_at, updated_at').order('created_at'),
    db.from('listing_import_batches').select('*').eq('status', 'preview').not('drive_file_id', 'is', null).order('created_at', { ascending: false }),
    db.from('listing_import_batches').select(HISTORY_COLUMNS).in('status', ['published', 'discarded']).not('drive_file_id', 'is', null).order('created_at', { ascending: false }).limit(30),
    db.from('announcement_import_batches').select('*').eq('status', 'preview').order('created_at', { ascending: false }),
    db.from('announcement_import_batches').select(ANNOUNCEMENT_HISTORY_COLUMNS).in('status', ['published', 'discarded']).order('created_at', { ascending: false }).limit(30),
    db.from('drive_content_files').select(CONTENT_FILE_COLUMNS).in('status', ['held', 'error', 'skipped']).order('name'),
  ])

  const mapped = new Map(((mappings.data ?? []) as { drive_file_id: string; subtest: string }[]).map(m => [m.drive_file_id, m.subtest]))
  const rows = ((files.data ?? []) as KbFileRow[]).map(f => ({ ...f, mapped_subtest: mapped.get(f.drive_file_id) }))

  // Listings/announcements need migration 068; until it is applied these reads
  // fail and only that part of the page says so.
  const contentError = [listingPreviews, listingHistory, annPreviews, annHistory, contentFiles].find(r => r.error)?.error?.message
  const heldFiles = (contentFiles.data ?? []) as ContentFileRow[]
  const envFolderId = process.env.KB_DRIVE_FOLDER_ID?.trim()

  return (
    <>
      <Topbar title="Drive sync" />
      <PageBody intro="Questions, listings and announcements from the Iskotify Drive folders arrive as previews. Review each one and publish it; published files move to History.">
        {files.error ? (
          <ErrorBanner title="Couldn’t load the Drive files" message={files.error.message} />
        ) : (
          <QuestionSyncView
            files={rows}
            runs={(runs.data ?? []) as SyncRunRow[]}
            events={(events.data ?? []) as PublishEventRow[]}
          />
        )}

        {contentError ? (
          <ErrorBanner title="Couldn’t load the listings and announcements previews" message={contentError} />
        ) : (
          <>
            <DriveListingsCard
              previews={(listingPreviews.data ?? []) as ImportBatch[]}
              history={(listingHistory.data ?? []) as unknown as ImportBatchSummary[]}
              files={heldFiles.filter(f => f.content_type === 'listings')}
            />
            <DriveAnnouncementsCard
              previews={(annPreviews.data ?? []) as AnnouncementBatch[]}
              history={(annHistory.data ?? []) as unknown as AnnouncementBatchSummary[]}
              files={heldFiles.filter(f => f.content_type === 'announcements')}
            />
          </>
        )}

        <DriveSourcesPanel
          sources={(sources.data ?? []) as DriveSourceRow[]}
          envFolderId={envFolderId && isFolderId(envFolderId) ? envFolderId : null}
          serviceAccountEmail={serviceAccountEmail()}
          loadError={sources.error?.message}
        />
      </PageBody>
    </>
  )
}
