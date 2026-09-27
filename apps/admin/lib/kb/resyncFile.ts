// Re-syncs one Drive file on demand (after an admin saves or clears its
// mapping), logged as a manual run like "Sync now".

import type { SupabaseClient } from '@supabase/supabase-js'
import { createDriveGateway, createMediaStore } from './driveClient'
import { syncDriveFolder } from './syncDriveFolder'
import { logSyncRun } from './syncRuns'
import type { Resync } from './fileMapping'

const TIME_BUDGET_MS = 45_000

export function driveResync(db: SupabaseClient): Resync {
  return async (driveFileId) => {
    const rootId = process.env.KB_DRIVE_FOLDER_ID
    if (!rootId) throw new Error('KB_DRIVE_FOLDER_ID is not configured')
    return logSyncRun(db, 'manual', () =>
      syncDriveFolder(db, createDriveGateway(), createMediaStore(db), {
        rootId,
        onlyFileIds: [driveFileId],
        deadline: Date.now() + TIME_BUDGET_MS,
      }),
    )
  }
}

