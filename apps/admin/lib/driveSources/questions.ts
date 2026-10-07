// Runs the question pipeline (syncDriveFolder, unchanged) over every questions
// source and folds the results into one SyncSummary, so the run log and the
// "Sync now" toast read the same as with a single KB_DRIVE_FOLDER_ID.

import type { SupabaseClient } from '@supabase/supabase-js'
import { syncDriveFolder, type DriveGateway, type MediaStore, type SyncOptions, type SyncSummary } from '../kb/syncDriveFolder'
import type { SyncSource } from './sources'

export const emptySummary = (): SyncSummary => ({ imported: [], skipped: [], needsMapping: [], errors: [], unchanged: 0, remaining: 0, aiMapped: 0 })

function merge(into: SyncSummary, s: SyncSummary): SyncSummary {
  into.imported.push(...s.imported)
  into.skipped.push(...s.skipped)
  into.needsMapping.push(...s.needsMapping)
  into.errors.push(...s.errors)
  into.unchanged += s.unchanged
  into.remaining += s.remaining
  into.aiMapped += s.aiMapped
  return into
}

/**
 * One syncDriveFolder per questions folder, sharing the deadline. A folder that
 * can't be read is reported as an error and the others still run; if every
 * folder fails, the first failure is thrown (as with a single folder).
 */
export async function syncQuestionSources(
  db: SupabaseClient,
  drive: DriveGateway,
  media: MediaStore,
  sources: SyncSource[],
  opts: Omit<SyncOptions, 'rootId'>,
): Promise<SyncSummary> {
  const out = emptySummary()
  const failures: { source: SyncSource; err: unknown }[] = []
  for (const source of sources) {
    try {
      merge(out, await syncDriveFolder(db, drive, media, { ...opts, rootId: source.folderId }))
    } catch (err) {
      failures.push({ source, err })
    }
  }
  if (failures.length > 0 && failures.length === sources.length) throw failures[0]!.err
  for (const { source, err } of failures) {
    out.errors.push({
      driveFileId: source.folderId,
      name: `Folder “${source.label ?? source.folderId}”`,
      message: err instanceof Error ? err.message : String(err),
    })
  }
  return out
}
