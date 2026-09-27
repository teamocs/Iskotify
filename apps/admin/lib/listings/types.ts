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
}

/** History rows are fetched without the heavy `rows` (and `invalid`/`missing`) jsonb. */
export type ImportBatchSummary = Omit<ImportBatch, 'rows' | 'invalid' | 'missing'>
