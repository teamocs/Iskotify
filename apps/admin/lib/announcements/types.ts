// Announcements from the weekly admissions report Docs (Drive sync) → the
// admissions_updates table (supabase/migrations/023) the app's News feed reads.

/** The report sections that become announcements. No Change / Unable to Verify never do. */
export type ReportSection = 'urgent' | 'new' | 'info' | 'social'
export type UpdateSeverity = 'urgent' | 'important' | 'info'

/** One admissions_updates row, as written on publish. */
export interface AdmissionsUpdateRow {
  id: string
  report_date: string
  severity: UpdateSeverity
  school_slug: string | null
  school_name: string | null
  title: string
  body: string
  action_required: string | null
  event_date: string | null
  event_type: string | null
  sources: string[]
  /** false for Social Media Findings (published unverified); true otherwise. */
  verified: boolean
}

/** One extracted finding, before it is compared with what is live. */
export interface AnnouncementCandidate {
  id: string
  section: ReportSection
  /** The verbatim excerpt of the document the finding came from (checked to be there). */
  quote: string
  update: AdmissionsUpdateRow
}

export interface AnnouncementRow extends AnnouncementCandidate {
  action: 'new' | 'update' | 'unchanged'
  /** Fields that differ from the live row (only for 'update'). */
  changes: string[]
}

/** An item the validator left out, and why. */
export interface SkippedItem {
  title: string
  reason: string
}

export type AnnouncementBatchStatus = 'preview' | 'published' | 'discarded'

/** One row of announcement_import_batches (migration 068). */
export interface AnnouncementBatch {
  id: string
  drive_file_id: string
  file_name: string
  report_date: string | null
  status: AnnouncementBatchStatus
  rows: AnnouncementRow[]
  skipped: SkippedItem[]
  new_count: number
  update_count: number
  unchanged_count: number
  skipped_count: number
  published_count: number
  created_at: string
  published_by: string | null
  published_at: string | null
  discarded_at: string | null
}

/** History rows are read without the heavy jsonb. */
export type AnnouncementBatchSummary = Omit<AnnouncementBatch, 'rows' | 'skipped'>

export const ANNOUNCEMENT_HISTORY_COLUMNS = [
  'id', 'drive_file_id', 'file_name', 'report_date', 'status',
  'new_count', 'update_count', 'unchanged_count', 'skipped_count', 'published_count',
  'created_at', 'published_by', 'published_at', 'discarded_at',
].join(', ')
