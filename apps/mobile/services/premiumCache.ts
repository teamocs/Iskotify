import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'
import { scheduleWebPersist } from '../db/webPersist'

/**
 * The last known Full Access state on this device (user_settings.premium_cached),
 * and the account it belongs to (premium_user_id): it only counts for that account.
 * Written directly, NOT through updateSettings: it is a cache of the store /
 * server answer, so it must not mark the backup dirty or travel with it.
 */
export async function readPremiumCache(db: DrizzleClient): Promise<{ premium: boolean; checkedAt: number; userId: string }> {
  const rows = await db
    .select({ premium: userSettings.premiumCached, checkedAt: userSettings.premiumCheckedAt, userId: userSettings.premiumUserId })
    .from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const r = rows[0]
  return { premium: !!r?.premium, checkedAt: r?.checkedAt ?? 0, userId: r?.userId ?? '' }
}

export async function writePremiumCache(db: DrizzleClient, premium: boolean, userId: string, checkedAt: number = Date.now()): Promise<void> {
  const set = { premiumCached: premium, premiumCheckedAt: checkedAt, premiumUserId: userId }
  await db.insert(userSettings)
    .values({ id: 1, ...set })
    .onConflictDoUpdate({ target: userSettings.id, set })
  scheduleWebPersist()
}

/** Sign-out / account switch / delete: the next person on this device starts free. */
export async function clearPremiumCache(db: DrizzleClient): Promise<void> {
  await db.update(userSettings).set({ premiumCached: false, premiumCheckedAt: 0, premiumUserId: '' }).where(eq(userSettings.id, 1))
  scheduleWebPersist()
}
