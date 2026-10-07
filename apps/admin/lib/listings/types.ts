import type { ImportRow, InvalidRow, MissingListing } from './planImport'

export type ImportBatchStatus = 'preview' | 'published' | 'discarded'

/** One row of `listing_import_batches` (see supabase/migrations/063_*.sql). */
export interface ImportBatch {
  id: string
  sheet_id: string
  sheet_url: string
  sheet_title: string | null
  tab: string | null
  status: ImportBatchStatus
  rows: ImportRow[]
  invalid: InvalidRow[]
  missing: MissingListing[]
  column_map: Record<string, string> | null
  mapped_by_ai: boolean
  new_count: number
  update_count: number
  unchanged_count: number
  invalid_count: number
  closed_count: number
  created_by: string | null
  created_at: string
  published_by: string | null
  published_at: string | null
  discarded_at: string | null
  /** Migration 068: 'sheet_link' (pasted on /admin/listings/import) or 'drive' (the Drive sync). */
  source?: 'sheet_link' | 'drive'
  /** Migration 068: the Drive file a 'drive' batch was read from. */
  drive_file_id?: string | null
}

/** History rows are fetched without the heavy `rows` (and `invalid`/`missing`) jsonb. */
export type ImportBatchSummary = Omit<ImportBatch, 'rows' | 'invalid' | 'missing'>

// listing_import_batches.rows/invalid/missing are heavy jsonb — history only
// ever needs the summary columns (the counts, not every row).
export const HISTORY_COLUMNS = [
  'id', 'sheet_id', 'sheet_url', 'sheet_title', 'tab', 'status', 'mapped_by_ai', 'column_map',
  'new_count', 'update_count', 'unchanged_count', 'invalid_count', 'closed_count',
  'created_by', 'created_at', 'published_by', 'published_at', 'discarded_at',
].join(', ')

/** The live listing columns planImport diffs against (the sheet-owned fields, plus slug and status). */
export const EXISTING_LISTING_COLUMNS = [
  'slug', 'status', 'type', 'title', 'provider', 'description', 'requirements', 'coverage',
  'deadline', 'exam_date', 'results_date', 'events', 'target_courses', 'target_year_levels',
  'tags', 'region', 'grant_amount', 'external_url', 'image_url',
].join(', ')

const isSheetsLink = (url: string | null | undefined): url is string => !!url && url.startsWith('https://docs.google.com/spreadsheets/')

/** The link to prefill the import form with: the preview's, else the newest pasted sheet, else GOOGLE_SHEETS_ID. */
export function lastSheetUrl(preview: Pick<ImportBatch, 'sheet_url'> | null, history: Pick<ImportBatch, 'sheet_url'>[]): string | null {
  const defaultSheetId = process.env.GOOGLE_SHEETS_ID
  return (
    preview?.sheet_url ??
    // History also lists Drive-sync batches, whose link is a Drive file, not a sheet to paste.
    history.find(h => isSheetsLink(h.sheet_url))?.sheet_url ??
    (defaultSheetId ? `https://docs.google.com/spreadsheets/d/${defaultSheetId}/edit` : null)
  )
}
