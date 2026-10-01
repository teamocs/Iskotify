import { eq } from 'drizzle-orm'
import { userSettings } from '../../db/schema'
import { flushWebPersist } from '../../db/webPersist'
import { invalidate } from '../../services/queryCache'
import type { DrizzleClient } from '../../db/client'
import type { ScholarshipPromptSettings } from '../../utils/scholarshipProfilePrompt'

/** Under 'settings:' so updateSettings() → invalidate('settings:') re-reads it. */
export const SCHOLARSHIP_PROMPT_KEY = 'settings:scholarshipPrompt'

/** The fields Today's scholarship-profile prompt decides on; null when there is no settings row. */
export async function readScholarshipPromptSettings(db: DrizzleClient): Promise<ScholarshipPromptSettings | null> {
  const rows = await db
    .select({
      school: userSettings.school,
      province: userSettings.province,
      targetCourses: userSettings.targetCourses,
      sensitiveConsentAt: userSettings.sensitiveConsentAt,
      gwa: userSettings.gwa,
      profilePromptDismissedAt: userSettings.profilePromptDismissedAt,
    })
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1)
  return rows?.[0] ?? null
}

/**
 * Remember that the student dismissed the prompt (user_settings.
 * profile_prompt_dismissed_at). Device-local, like tour_seen_at: not a user
 * edit to back up. Flushed straight away on web, where a reload would
 * otherwise beat the debounced IndexedDB save.
 */
export async function dismissScholarshipPrompt(db: DrizzleClient, now = Date.now()): Promise<void> {
  await db.update(userSettings).set({ profilePromptDismissedAt: now }).where(eq(userSettings.id, 1))
  flushWebPersist()
  // Drop the cached copy so the next Today mount never flashes the dismissed card.
  invalidate(SCHOLARSHIP_PROMPT_KEY)
}
