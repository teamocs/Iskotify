import type { StageFile } from '@/lib/kb/syncStages'

// One row of the kb_drive_files ledger (supabase/migrations/055, 058, 063) as the page reads it.
export interface KbFileRow extends StageFile {
  path: string
  dialect: string | null
  mapping_source: 'rule' | 'ai' | 'admin' | null
  rows_total: number
  rows_missing_media: number
  rows_drafted: number
  rows_rejected: number
  headers: string[] | null
  message: string | null
  updated_at: string
  /** From kb_file_mappings, when the file has a saved mapping. */
  mapped_subtest?: string
}

// kb_sync_runs (migration 063).
export interface SyncRunRow {
  id: number
  trigger: 'cron' | 'manual'
  status: 'running' | 'ok' | 'warn' | 'error'
  imported: number
  unchanged: number
  needs_mapping: number
  skipped: number
  errors: number
  remaining: number
  ai_mapped: number
  message: string | null
  started_at: string
  finished_at: string | null
}

// kb_publish_events (migration 063).
export interface PublishEventRow {
  id: number
  drive_file_id: string
  file_name: string
  published: number
  already_published: number
  held_missing_media: number
  held_few_options: number
  held_duplicate: number
  created_at: string
}

export const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
