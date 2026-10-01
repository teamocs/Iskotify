import type { DrizzleClient } from '../db/client'
import { identifyUser, setAnalyticsConsent } from '../lib/analytics'
import { analyticsAllowed } from '../utils/consent'
import { getSettings } from './settings'

/**
 * Read the stored consent and switch analytics on or off to match. Called on
 * launch, after consent is recorded and when the Settings switch moves. Fails
 * closed: if the settings cannot be read, analytics stays off.
 */
export async function applyAnalyticsConsent(db: DrizzleClient): Promise<boolean> {
  let allowed = false
  try {
    allowed = analyticsAllowed(await getSettings(db))
  } catch (e) {
    console.warn('[analytics] could not read consent, staying off:', e)
  }
  setAnalyticsConsent(allowed)
  return allowed
}

/**
 * Hand analytics a signed-in account id, but only after this device's stored
 * consent is applied: call it after the backup pull, which resets analytics on
 * an account switch and may restore the student's own choice. Without consent
 * the id is only held in memory (lib/analytics.ts).
 */
export async function identifyAfterConsent(db: DrizzleClient, userId: string): Promise<void> {
  await applyAnalyticsConsent(db)
  identifyUser(userId)
}
