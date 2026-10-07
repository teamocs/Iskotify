// Re-syncs one Drive file on demand (after an admin saves or clears its
// mapping), logged as a manual run like "Sync now". The file may sit in any
// questions folder (KB_DRIVE_FOLDER_ID or a drive_sources row), so each is
// searched for it; listings/announcements folders are not.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createDriveGateway, createMediaStore } from './driveClient'
import { logSyncRun } from './syncRuns'
import type { Resync } from './fileMapping'
import { loadSyncSources } from '../driveSources/sources'
import { syncQuestionSources } from '../driveSources/questions'

const TIME_BUDGET_MS = 45_000

export function driveResync(db: SupabaseClient): Resync {
  return async (driveFileId) => {
    const { sources } = await loadSyncSources(db, process.env.KB_DRIVE_FOLDER_ID)
    const questions = sources.filter(s => s.contentType === 'questions')
    if (questions.length === 0) throw new Error('KB_DRIVE_FOLDER_ID is not configured and no questions Drive source is enabled')
    return logSyncRun(db, 'manual', () =>
      syncQuestionSources(db, createDriveGateway(), createMediaStore(db), questions, {
        onlyFileIds: [driveFileId],
        deadline: Date.now() + TIME_BUDGET_MS,
      }),
    )
  }
}
