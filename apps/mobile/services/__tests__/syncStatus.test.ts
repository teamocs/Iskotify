/**
 * TDD tests for services/syncStatus.ts
 *
 * Verifies the pub/sub sync-status store used to signal UI layers when a
 * Supabase→local-DB sync is in progress or has completed for the first time.
 */

import {
  getSyncStatus,
  subscribeSyncStatus,
  markSyncStart,
  markSyncDone,
  markFirstSyncDone,
  markSyncError,
  resetSyncStatus,
} from '../syncStatus'

beforeEach(() => {
  resetSyncStatus()
})

// ── 1. Initial state ──────────────────────────────────────────────────────────

describe('getSyncStatus — initial state', () => {
  it('returns isSyncing=false, firstSyncDone=false and lastError=null on a fresh reset', () => {
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(false)
    expect(status.firstSyncDone).toBe(false)
    expect(status.lastError).toBeNull()
  })
})

// ── 2. markSyncStart ──────────────────────────────────────────────────────────

describe('markSyncStart', () => {
  it('sets isSyncing to true', () => {
    markSyncStart()
    expect(getSyncStatus().isSyncing).toBe(true)
  })

  it('returns a NEW object after the first markSyncStart (state changed)', () => {
    const before = getSyncStatus()
    markSyncStart()
    const after = getSyncStatus()
    expect(after).not.toBe(before)
  })

  it('getSyncStatus is stable (same object reference) across repeated reads with no change', () => {
    markSyncStart()
    const a = getSyncStatus()
    const b = getSyncStatus()
    expect(a).toBe(b)
  })

  it('is a no-op (no new object, no listener) when already syncing', () => {
    markSyncStart()
    const snapshot = getSyncStatus()
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)

    markSyncStart() // second call — must be no-op
    expect(getSyncStatus()).toBe(snapshot) // same object identity
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})

// ── 3. markSyncDone ───────────────────────────────────────────────────────────

describe('markSyncDone', () => {
  it('sets isSyncing=false and firstSyncDone=true', () => {
    markSyncStart()
    markSyncDone()
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(false)
    expect(status.firstSyncDone).toBe(true)
  })

  it('works even when called without a prior markSyncStart (firstSyncDone becomes true)', () => {
    markSyncDone()
    expect(getSyncStatus().firstSyncDone).toBe(true)
    expect(getSyncStatus().isSyncing).toBe(false)
  })

  it('produces a new object reference after the state changes', () => {
    const before = getSyncStatus()
    markSyncDone()
    expect(getSyncStatus()).not.toBe(before)
  })
})

// ── 4. markFirstSyncDone ──────────────────────────────────────────────────────

describe('markFirstSyncDone', () => {
  it('sets firstSyncDone=true without touching isSyncing', () => {
    markSyncStart()          // isSyncing = true
    markFirstSyncDone()      // must NOT touch isSyncing
    const status = getSyncStatus()
    expect(status.firstSyncDone).toBe(true)
    expect(status.isSyncing).toBe(true)  // still true — untouched
  })

  it('is a no-op when firstSyncDone is already true (no new object, no notification)', () => {
    markFirstSyncDone()
    const snapshot = getSyncStatus()
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)

    markFirstSyncDone() // second call — must be no-op
    expect(getSyncStatus()).toBe(snapshot)
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })
})

// ── 4b. markSyncError / lastError ─────────────────────────────────────────────

describe('markSyncError', () => {
  it('sets lastError to the given message', () => {
    markSyncError('network down')
    expect(getSyncStatus().lastError).toBe('network down')
  })

  it('does not touch isSyncing or firstSyncDone', () => {
    markSyncStart()
    markSyncError('boom')
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(true)
    expect(status.firstSyncDone).toBe(false)
    expect(status.lastError).toBe('boom')
  })

  it('produces a new snapshot object and notifies listeners', () => {
    const before = getSyncStatus()
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)

    markSyncError('boom')
    expect(getSyncStatus()).not.toBe(before)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('is a no-op (same object, no notification) when the same message is already set', () => {
    markSyncError('boom')
    const snapshot = getSyncStatus()
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)

    markSyncError('boom') // same message — must be no-op
    expect(getSyncStatus()).toBe(snapshot)
    expect(cb).not.toHaveBeenCalled()
    unsub()
  })

  it('replaces a previous error with a new message (new snapshot)', () => {
    markSyncError('first')
    const afterFirst = getSyncStatus()
    markSyncError('second')
    const afterSecond = getSyncStatus()
    expect(afterSecond).not.toBe(afterFirst)
    expect(afterSecond.lastError).toBe('second')
  })

  it('survives markSyncDone (finally runs after catch — error must persist)', () => {
    markSyncStart()
    markSyncError('boom')
    markSyncDone()
    const status = getSyncStatus()
    expect(status.lastError).toBe('boom')
    expect(status.isSyncing).toBe(false)
  })
})

describe('markSyncStart — clears lastError', () => {
  it('resets lastError to null when a new sync starts', () => {
    markSyncError('boom')
    markSyncStart()
    expect(getSyncStatus().lastError).toBeNull()
  })

  it('notifies (new snapshot) when already syncing but an error is pending', () => {
    markSyncStart()
    markSyncError('boom')
    const before = getSyncStatus()
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)

    markSyncStart() // isSyncing already true, but lastError must be cleared
    const after = getSyncStatus()
    expect(after).not.toBe(before)
    expect(after.lastError).toBeNull()
    expect(after.isSyncing).toBe(true)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })
})

// ── 5. subscribe / unsubscribe ────────────────────────────────────────────────

describe('subscribeSyncStatus', () => {
  it('calls listener when state changes', () => {
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)
    markSyncStart()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('stops calling listener after unsubscribe', () => {
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)
    markSyncStart()
    unsub()
    markSyncDone()
    expect(cb).toHaveBeenCalledTimes(1) // only the markSyncStart call
  })

  it('does NOT notify when a setter is a no-op (markSyncStart twice fires once)', () => {
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)
    markSyncStart()     // fires
    markSyncStart()     // no-op — must NOT fire again
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('notifies on markSyncDone after markSyncStart', () => {
    const cb = jest.fn()
    const unsub = subscribeSyncStatus(cb)
    markSyncStart()
    markSyncDone()
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
  })

  it('multiple listeners all receive notification', () => {
    const cb1 = jest.fn()
    const cb2 = jest.fn()
    const unsub1 = subscribeSyncStatus(cb1)
    const unsub2 = subscribeSyncStatus(cb2)
    markSyncStart()
    expect(cb1).toHaveBeenCalledTimes(1)
    expect(cb2).toHaveBeenCalledTimes(1)
    unsub1()
    unsub2()
  })

  it('returns an unsubscribe function', () => {
    const unsub = subscribeSyncStatus(() => {})
    expect(typeof unsub).toBe('function')
    unsub()
  })
})

// ── 6. resetSyncStatus ────────────────────────────────────────────────────────

describe('resetSyncStatus', () => {
  it('restores initial state after changes', () => {
    markSyncStart()
    markSyncError('boom')
    markSyncDone()
    resetSyncStatus()
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(false)
    expect(status.firstSyncDone).toBe(false)
    expect(status.lastError).toBeNull()
  })

  it('produces a fresh snapshot object after reset', () => {
    markSyncStart()
    const afterStart = getSyncStatus()
    resetSyncStatus()
    expect(getSyncStatus()).not.toBe(afterStart)
  })
})
