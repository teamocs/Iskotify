import { eq } from 'drizzle-orm'
import { userSettings } from '../../db/schema'
import { flushWebPersist } from '../../db/webPersist'
import type { DrizzleClient } from '../../db/client'

/**
 * Record that the tour has been shown (user_settings.tour_seen_at), so
 * finishing onboarding opens it only once. Only the first showing is kept.
 * Flushed straight away on web, where a reload would otherwise beat the
 * debounced IndexedDB save.
 */
export async function markTourSeen(db: DrizzleClient, now = Date.now()): Promise<void> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  if (Number(rows[0]?.tourSeenAt ?? 0) > 0) return
  await db.insert(userSettings)
    .values({ id: 1, tourSeenAt: now })
    .onConflictDoUpdate({ target: userSettings.id, set: { tourSeenAt: now } })
  flushWebPersist()
}
