import type { DrizzleClient } from '../db/client'

// Debounced, SERIALIZED scheduler for the cloud-backup push.
//
// Kept free of supabase / schema imports on purpose: every writer of user data
// (notes, plan, focus, settings…) calls schedulePushUserData, and none of them
// should have to drag the sync service (and its Supabase client) into their
// module graph. services/sync.ts registers the real pusher at load time; until
// then (unit tests of a writer) scheduling is a no-op.
//
// Guarantees:
//  - bursts of calls collapse into one push after PUSH_DEBOUNCE_MS (trailing);
//  - at most ONE push is in flight; a push that comes due while another runs
//    sets a dirty flag and exactly one trailing push follows, so an older
//    push can never land after a newer one;
//  - flushPendingPush() lets a pull / app-background send queued edits now.

export const PUSH_DEBOUNCE_MS = 1500

type Pusher = (db: DrizzleClient) => Promise<boolean>

let pusher: Pusher | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let pendingDb: DrizzleClient | null = null
let inFlight: Promise<void> | null = null
let dirty = false

export function registerPusher(fn: Pusher): void {
  pusher = fn
}

async function runOnce(): Promise<void> {
  if (!pusher || !pendingDb) return
  try {
    await pusher(pendingDb)
  } catch (err) {
    console.warn('[sync] scheduled push failed:', err)
  }
}

function startPush(): Promise<void> {
  if (inFlight) {
    dirty = true
    return inFlight
  }
  inFlight = (async () => {
    try {
      await runOnce()
      while (dirty) {
        dirty = false
        await runOnce()
      }
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function schedulePushUserData(db: DrizzleClient): void {
  if (!pusher) return
  pendingDb = db
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void startPush()
  }, PUSH_DEBOUNCE_MS)
}

/**
 * Sends any queued edit now and resolves once it (and any push already running,
 * plus its trailing push) has finished. Resolves immediately when idle.
 */
export function flushPendingPush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
    return startPush()
  }
  return inFlight ?? Promise.resolve()
}

/** Drops a queued (not yet started) push — used when the local data no longer belongs to the signed-in account. */
export function cancelPendingPush(): void {
  if (timer) clearTimeout(timer)
  timer = null
  dirty = false
}

export function _resetPushSchedulerForTests(): void {
  if (timer) clearTimeout(timer)
  timer = null
  pendingDb = null
  inFlight = null
  dirty = false
}
