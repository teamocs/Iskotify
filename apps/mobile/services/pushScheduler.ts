import { sql } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'

// Debounced, SERIALIZED scheduler for the cloud-backup push, plus the DURABLE
// "unsynced edits" marker.
//
// Kept free of supabase imports on purpose: every writer of user data (notes,
// plan, focus, settings…) calls schedulePushUserData, and none of them should
// have to drag the sync service (and its Supabase client) into their module
// graph. services/sync.ts registers the real pusher at load time; until then
// (unit tests of a writer) nothing is pushed.
//
// Guarantees:
//  - every schedule call durably records user_settings.push_dirty_at, so a reload,
//    a crash or a failed push cannot forget that local data is not in the cloud
//    (pushUserData clears it only after a successful upsert; pullUserData checks it);
//  - bursts of calls collapse into one push after PUSH_DEBOUNCE_MS (trailing);
//  - at most ONE push is in flight; a push that comes due while another runs
//    sets a dirty flag and exactly one trailing push follows, so an older
//    push can never land after a newer one;
//  - flushPendingPush() sends queued edits now and reports whether they landed.

export const PUSH_DEBOUNCE_MS = 1500

type Pusher = (db: DrizzleClient) => Promise<boolean>

let pusher: Pusher | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let pendingDb: DrizzleClient | null = null
let inFlight: Promise<boolean> | null = null
let dirty = false
let markChain: Promise<void> = Promise.resolve()

export function registerPusher(fn: Pusher): void {
  pusher = fn
}

/** Durable marker: monotonic so a push that read an older value can tell a newer edit landed. */
function markDirty(db: DrizzleClient): void {
  markChain = markChain
    .then(async () => {
      const now = Date.now()
      await db.insert(userSettings)
        .values({ id: 1, pushDirtyAt: now })
        .onConflictDoUpdate({
          target: userSettings.id,
          set: { pushDirtyAt: sql`max(${now}, ${userSettings.pushDirtyAt} + 1)` },
        })
    })
    .catch(err => console.warn('[sync] could not record unsynced edit marker:', err))
}

async function runOnce(): Promise<boolean> {
  if (!pusher || !pendingDb) return true
  try {
    return await pusher(pendingDb)
  } catch (err) {
    console.warn('[sync] scheduled push failed:', err)
    return false
  }
}

function startPush(): Promise<boolean> {
  if (inFlight) {
    dirty = true
    return inFlight
  }
  inFlight = (async () => {
    try {
      let ok = await runOnce()
      while (dirty) {
        dirty = false
        ok = await runOnce()
      }
      return ok
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function schedulePushUserData(db: DrizzleClient): void {
  markDirty(db)
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
 * plus its trailing push) has finished. Resolves true when everything landed or
 * nothing was pending, false when the last push failed (the edit stays dirty).
 */
export async function flushPendingPush(): Promise<boolean> {
  await markChain
  if (timer) {
    clearTimeout(timer)
    timer = null
    return startPush()
  }
  return inFlight ?? true
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
  markChain = Promise.resolve()
}
