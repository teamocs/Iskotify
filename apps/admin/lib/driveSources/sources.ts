// Which Google Drive folders the sync reads, and as what (drive_sources,
// migration 068). KB_DRIVE_FOLDER_ID stays an implicit 'questions' source, so
// a deployment that never adds a row keeps working exactly as before — and so
// does one where drive_sources can't be read (e.g. before 068 is applied).

import type { SupabaseClient } from '@supabase/supabase-js'

export const DRIVE_CONTENT_TYPES = ['questions', 'listings', 'announcements'] as const
export type DriveContentType = typeof DRIVE_CONTENT_TYPES[number]

export const CONTENT_TYPE_LABEL: Record<DriveContentType, string> = {
  questions: 'Questions',
  listings: 'Listings (exams & scholarships)',
  announcements: 'Announcements',
}

export interface SyncSource {
  /** drive_sources.id; null for the implicit KB_DRIVE_FOLDER_ID source. */
  id: string | null
  contentType: DriveContentType
  folderId: string
  label: string | null
}

/** One row of drive_sources as the console reads it. */
export interface DriveSourceRow {
  id: string
  content_type: DriveContentType
  folder_id: string
  label: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

// Drive ids are URL-safe base64. The id is interpolated into a files.list
// query, so nothing else may get through (driveClient re-checks it).
const FOLDER_ID = /^[A-Za-z0-9_-]{10,100}$/

/** Enabled drive_sources read per run (oldest first), so one run's listing stays bounded. */
export const MAX_ENABLED_SOURCES = 20

export const isDriveContentType = (v: unknown): v is DriveContentType =>
  typeof v === 'string' && (DRIVE_CONTENT_TYPES as readonly string[]).includes(v)

export const isFolderId = (v: unknown): v is string => typeof v === 'string' && FOLDER_ID.test(v)

export const folderUrl = (folderId: string) => `https://drive.google.com/drive/folders/${folderId}`

/**
 * A pasted Drive folder link (…/drive/folders/<id>, …/drive/u/1/folders/<id>,
 * …/open?id=<id>) or a bare id → the folder id, or null. Only drive.google.com
 * links are accepted; the link itself is never fetched.
 */
export function parseDriveFolderInput(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (isFolderId(raw)) return raw

  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.hostname !== 'drive.google.com') return null

  const m = url.pathname.match(/\/folders\/([^/?#]+)/)
  const id = m ? m[1] : url.pathname === '/open' ? url.searchParams.get('id') : null
  return isFolderId(id) ? id : null
}

/**
 * The enabled sources this run reads: KB_DRIVE_FOLDER_ID first (as questions),
 * then each enabled drive_sources row. Invalid rows are dropped. When the table
 * can't be read the env folder runs alone and `warning` says why.
 */
export async function loadSyncSources(
  db: SupabaseClient,
  envFolderId: string | undefined,
): Promise<{ sources: SyncSource[]; warning?: string }> {
  const sources: SyncSource[] = []
  const envId = envFolderId?.trim()
  if (envId) sources.push({ id: null, contentType: 'questions', folderId: envId, label: 'KB_DRIVE_FOLDER_ID' })

  let rows: Pick<DriveSourceRow, 'id' | 'content_type' | 'folder_id' | 'label'>[]
  try {
    const { data, error } = await db
      .from('drive_sources')
      .select('id, content_type, folder_id, label')
      .eq('enabled', true)
      .order('created_at')
    if (error) throw new Error(error.message)
    rows = (data ?? []) as typeof rows
  } catch (err) {
    const warning = `drive_sources could not be read (${err instanceof Error ? err.message : String(err)}); syncing KB_DRIVE_FOLDER_ID only`
    console.warn('[drive-sync]', warning)
    return { sources, warning }
  }

  let warning: string | undefined
  if (rows.length > MAX_ENABLED_SOURCES) {
    warning = `${rows.length} enabled Drive sources; only the first ${MAX_ENABLED_SOURCES} are read each run`
    console.warn('[drive-sync]', warning)
    rows = rows.slice(0, MAX_ENABLED_SOURCES)
  }

  for (const r of rows) {
    if (!isDriveContentType(r.content_type) || !isFolderId(r.folder_id)) continue
    const dup = sources.findIndex(s => s.folderId === r.folder_id && s.contentType === r.content_type)
    const source: SyncSource = { id: r.id, contentType: r.content_type, folderId: r.folder_id, label: r.label ?? null }
    // The env folder listed again in the table: one run, under the row's name.
    if (dup >= 0) sources[dup] = source
    else sources.push(source)
  }
  return warning ? { sources, warning } : { sources }
}
