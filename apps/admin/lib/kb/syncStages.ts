// Where each Drive file sits in the sync flow on /admin/sync:
//   attention → the sync couldn't read it (needs a mapping, or failed)
//   preview   → imported drafts waiting for review and Publish
//   history   → published since its last import (or nothing new to review)
//   ignored   → deliberately not imported (unsupported type, out of scope)
// Publishing stamps published_at, which is what moves a file from Preview to
// History; a later import with new drafts brings it back to Preview.

import { resolveFileRule } from './fileRules'

export type SyncStage = 'attention' | 'preview' | 'history' | 'ignored'

export interface StageFile {
  drive_file_id: string
  name: string
  status: 'imported' | 'needs_mapping' | 'skipped' | 'error'
  rows_imported: number
  imported_at: string | null
  published_at: string | null
}

export function stageOf(f: StageFile): SyncStage {
  if (f.status === 'skipped') return 'ignored'
  if (f.status !== 'imported' || f.rows_imported === 0) return 'attention'
  const published = f.published_at ? Date.parse(f.published_at) : NaN
  const imported = f.imported_at ? Date.parse(f.imported_at) : 0
  return published >= imported ? 'history' : 'preview'
}

export function splitStages<T extends StageFile>(files: T[]): Record<SyncStage, T[]> {
  const out: Record<SyncStage, T[]> = { attention: [], preview: [], history: [], ignored: [] }
  for (const f of files) out[stageOf(f)].push(f)
  return out
}

/** The question pool a file feeds: its saved mapping's, else its file-name rule's. */
export function poolOf(name: string, mappedSubtest: string | undefined): string | null {
  if (mappedSubtest) return mappedSubtest
  const rule = resolveFileRule(name)
  return rule?.kind === 'import' ? rule.subtest : null
}

/**
 * A Preview file at a glance, from its ledger counts: drafts Publish will make
 * live, and drafts it will hold because their figure isn't in Drive. Duplicates
 * of live questions and unanswerable items are only known at Preview/Publish.
 */
export function draftReadiness(f: { rows_drafted: number; rows_missing_media: number }): { ready: number; heldMissingFigure: number } {
  const heldMissingFigure = Math.min(f.rows_missing_media, f.rows_drafted)
  return { ready: f.rows_drafted - heldMissingFigure, heldMissingFigure }
}
