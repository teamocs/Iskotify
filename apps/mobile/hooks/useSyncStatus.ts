import { useSyncExternalStore } from 'react'
import { getSyncStatus, subscribeSyncStatus } from '../services/syncStatus'
import type { SyncStatus } from '../services/syncStatus'

export type { SyncStatus }

/**
 * React hook that subscribes to the sync-status store.
 *
 * Uses useSyncExternalStore for tear-free reads in concurrent React — the
 * same getSyncStatus function is passed as the server snapshot getter for
 * web SSR-safety (expo export -p web).
 *
 * Returns a stable SyncStatus reference between state changes, so components
 * only re-render when isSyncing or firstSyncDone actually change.
 */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    getSyncStatus, // server/SSR snapshot
  )
}
