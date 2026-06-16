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
  resetSyncStatus,
} from '../syncStatus'

beforeEach(() => {
  resetSyncStatus()
})

// ── 1. Initial state ──────────────────────────────────────────────────────────

describe('getSyncStatus — initial state', () => {
  it('returns isSyncing=false and firstSyncDone=false on a fresh reset', () => {
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(false)
    expect(status.firstSyncDone).toBe(false)
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
    markSyncDone()
    resetSyncStatus()
    const status = getSyncStatus()
    expect(status.isSyncing).toBe(false)
    expect(status.firstSyncDone).toBe(false)
  })

  it('produces a fresh snapshot object after reset', () => {
    markSyncStart()
    const afterStart = getSyncStatus()
    resetSyncStatus()
    expect(getSyncStatus()).not.toBe(afterStart)
  })
})
