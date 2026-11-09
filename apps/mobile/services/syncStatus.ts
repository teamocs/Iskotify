/**
 * syncStatus — framework-agnostic pub/sub store for Supabase→local-DB sync state.
 *
 * Designed to be consumed via useSyncExternalStore (hooks/useSyncStatus.ts) from
 * React components, and called directly from services/sync.ts syncOnLaunch().
 *
 * Stable snapshot guarantee: getSyncStatus() returns the same object reference
 * between state changes. A new object is created only when a field actually
 * changes. This prevents infinite render loops in useSyncExternalStore.
 */

export interface SyncStatus {
  isSyncing: boolean
  firstSyncDone: boolean
  /** Message from the most recent failed sync, or null. Cleared by markSyncStart(). */
  lastError: string | null
}

// ── Module-private state ──────────────────────────────────────────────────────

const INITIAL: SyncStatus = { isSyncing: false, firstSyncDone: false, lastError: null }

// Mutable current values — mutated in-place only via setters below.
let _runs = 0 // overlapping syncs in flight; isSyncing is _runs > 0
let _firstSyncDone = false
let _lastError: string | null = null

// The cached snapshot object. Replaced (new object) only when a field changes.
let _snapshot: SyncStatus = { ...INITIAL }

// Registered change listeners.
const _listeners = new Set<() => void>()

// ── Internal helpers ──────────────────────────────────────────────────────────

function _notify(): void {
  for (const cb of _listeners) {
    cb()
  }
}

/**
 * Rebuild the snapshot object only when the current values differ from the
 * cached snapshot. Returns true if a new snapshot was created (state changed).
 */
function _sync(): boolean {
  const isSyncing = _runs > 0
  if (
    _snapshot.isSyncing === isSyncing &&
    _snapshot.firstSyncDone === _firstSyncDone &&
    _snapshot.lastError === _lastError
  ) {
    return false
  }
  _snapshot = { isSyncing, firstSyncDone: _firstSyncDone, lastError: _lastError }
  return true
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current sync status snapshot.
 * The same object reference is returned on repeated calls until state changes.
 * Compatible with React's useSyncExternalStore.
 */
export function getSyncStatus(): SyncStatus {
  return _snapshot
}

/**
 * Subscribe to state changes. Returns an unsubscribe function.
 * Compatible with React's useSyncExternalStore subscription contract.
 */
export function subscribeSyncStatus(cb: () => void): () => void {
  _listeners.add(cb)
  return () => {
    _listeners.delete(cb)
  }
}

/**
 * Signal that a sync has started. Overlapping runs are counted. Also clears
 * lastError — a new attempt supersedes any previous failure — except the
 * backup-failed banner, which only clearSyncError() removes.
 * No-op (and no notification) if already syncing and no clearable error was pending.
 */
export function markSyncStart(): void {
  _runs++
  if (_lastError !== BACKUP_FAILED_MESSAGE) _lastError = null
  if (_sync()) {
    _notify()
  }
}

/**
 * Signal that a sync has finished (success, early-exit, or error).
 * Ends one run (isSyncing=false once all overlapping runs are done) AND sets firstSyncDone=true.
 * Notifies listeners only if state actually changed.
 */
export function markSyncDone(): void {
  _runs = Math.max(0, _runs - 1)
  _firstSyncDone = true
  if (_sync()) {
    _notify()
  }
}

/**
 * Seed firstSyncDone=true for returning users who already have local data,
 * WITHOUT touching isSyncing.
 * No-op (and no notification) if firstSyncDone is already true.
 */
export function markFirstSyncDone(): void {
  _firstSyncDone = true
  if (_sync()) {
    _notify()
  }
}

/**
 * Signal that a sync attempt failed. Sets lastError and notifies listeners.
 * Does NOT touch isSyncing — sync.ts's finally block (markSyncDone) runs after
 * the catch, and markSyncDone must preserve the error so UI layers can show it.
 * No-op (and no notification) if the same message is already set.
 */
export function markSyncError(message: string): void {
  _lastError = message
  if (_sync()) {
    _notify()
  }
}

/** Shown on the sync error banner while backup uploads keep failing. */
export const BACKUP_FAILED_MESSAGE = "Your latest changes haven't been backed up yet. They're safe on this device."

/**
 * Clear lastError only if it is exactly `message` — e.g. a backup-upload failure
 * cleared by the next successful upload, without hiding an unrelated sync error.
 */
export function clearSyncError(message: string): void {
  if (_lastError !== message) return
  _lastError = null
  if (_sync()) {
    _notify()
  }
}

/**
 * Reset to initial state. Intended for tests only.
 * Always creates a new snapshot object so identity comparisons in tests work.
 */
export function resetSyncStatus(): void {
  _runs = 0
  _firstSyncDone = false
  _lastError = null
  // Force a new object regardless of current snapshot identity.
  _snapshot = { isSyncing: false, firstSyncDone: false, lastError: null }
  _listeners.clear()
}
