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
let _isSyncing = false
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
  if (
    _snapshot.isSyncing === _isSyncing &&
    _snapshot.firstSyncDone === _firstSyncDone &&
    _snapshot.lastError === _lastError
  ) {
    return false
  }
  _snapshot = { isSyncing: _isSyncing, firstSyncDone: _firstSyncDone, lastError: _lastError }
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
 * Signal that a sync has started. Also clears lastError — a new attempt
 * supersedes any previous failure.
 * No-op (and no notification) if isSyncing is already true and no error was pending.
 */
export function markSyncStart(): void {
  _isSyncing = true
  _lastError = null
  if (_sync()) {
    _notify()
  }
}

/**
 * Signal that a sync has finished (success, early-exit, or error).
 * Sets isSyncing=false AND firstSyncDone=true.
 * Notifies listeners only if state actually changed.
 */
export function markSyncDone(): void {
  _isSyncing = false
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

/**
 * Reset to initial state. Intended for tests only.
 * Always creates a new snapshot object so identity comparisons in tests work.
 */
export function resetSyncStatus(): void {
  _isSyncing = false
  _firstSyncDone = false
  _lastError = null
  // Force a new object regardless of current snapshot identity.
  _snapshot = { isSyncing: false, firstSyncDone: false, lastError: null }
  _listeners.clear()
}
