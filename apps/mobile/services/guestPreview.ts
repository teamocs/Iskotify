/**
 * The web glimpse (P4), device side. A signed-out web visitor taking the free
 * diagnostic needs:
 *  - the bare user_settings row (id 1) the practice hooks and the sync engine
 *    expect. Nothing else is written: no name, no onboarding step, no consent,
 *    no owner. Onboarding still runs in full after sign-up, consent first;
 *  - the public catalog (questions, passages, blueprints and sections, which
 *    are anon-readable, published only) mirrored by the normal catalog sync in
 *    guest mode: it never pushes a backup and never pulls one;
 *  - analytics off (nothing is recorded as consent).
 *
 * The guest's diagnostic sessions and attempts stay on this browser. The device
 * has no owner, so the first sign-in claims it and MERGES them into the
 * account's backup (services/sync.ts reconcileAccountOwner 'claimed' +
 * pullUserData's first-sign-in merge). A browser that still holds an account
 * that signed out is 'held': the preview writes nothing there, so a guest's run
 * can never land in, or be uploaded with, someone else's data.
 */
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'
import { resetAnalytics } from '../lib/analytics'
import { isDeviceHeldByAccount } from '../utils/guestPreview'
import { syncOnLaunch } from './sync'
import { markFirstSyncDone } from './syncStatus'

export type GuestDeviceState = 'guest' | 'held'

export interface GuestPreviewStart {
  state: GuestDeviceState
  /** Settles (never rejects) once the catalog sync has finished or failed. */
  catalog: Promise<void>
}

/** The bare settings row the hooks need; an existing row is never touched. */
export async function ensureGuestSettings(db: DrizzleClient): Promise<void> {
  await db.insert(userSettings).values({ id: 1 }).onConflictDoNothing()
  scheduleWebPersist()
}

let started: Promise<GuestPreviewStart> | null = null

async function start(db: DrizzleClient): Promise<GuestPreviewStart> {
  // Whatever this browser applied before (another person's stored choice), a
  // guest has consented to nothing.
  resetAnalytics()
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  if (isDeviceHeldByAccount(rows[0])) return { state: 'held', catalog: Promise.resolve() }
  await ensureGuestSettings(db)
  // The intro page shows its own loading state instead of the full-screen
  // "Setting up your data" overlay.
  markFirstSyncDone()
  const catalog = syncOnLaunch(db, { guest: true })
    .catch(e => console.warn('[guestPreview] catalog sync failed (non-fatal):', e))
  return { state: 'guest', catalog }
}

/** Prepare this browser for a guest, once per page load. */
export function startGuestPreview(db: DrizzleClient): Promise<GuestPreviewStart> {
  if (!started) {
    started = start(db)
    // A failed read is retried on the next call rather than cached.
    started.catch(() => { started = null })
  }
  return started
}

export function _resetGuestPreviewForTests(): void {
  started = null
}
