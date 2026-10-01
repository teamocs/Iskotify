import type { DrizzleClient } from '../db/client'
import { consentPatch, sensitiveWithdrawal, type AgeBand } from '../utils/consent'
import { updateSettings } from './settings'

/**
 * Persistence for the P1b consent choices. Each write goes through
 * updateSettings, which also schedules the debounced cloud-backup push, so a
 * recorded consent or a withdrawal reaches the backup too.
 */

/** Terms + Privacy Policy consent. A minor's guardian attestation is stamped with it. */
export async function recordConsent(
  db: DrizzleClient,
  input: { ageBand: AgeBand; now?: number },
): Promise<void> {
  const now = input.now ?? Date.now()
  await updateSettings(db, consentPatch(input.ageBand, now))
}

/** The student agreed to let us use grades, household income and Indigenous status. */
export async function grantSensitiveConsent(db: DrizzleClient, now: number = Date.now()): Promise<void> {
  await updateSettings(db, { sensitiveConsentAt: now })
}

/**
 * Withdraw that consent: clears income, GWA, Grade 8-11 grades and Indigenous
 * status on this device and schedules a backup push, so the cloud copy is
 * cleared too (the backup stores the whole settings row). The withdrawal time
 * travels with the backup, so other devices clear their copy as well.
 */
export async function withdrawSensitiveConsent(db: DrizzleClient, now: number = Date.now()): Promise<void> {
  await updateSettings(db, sensitiveWithdrawal(now))
}

/** The analytics switch. The time of the choice lets the latest one win across devices. */
export async function setAnalyticsOptIn(db: DrizzleClient, on: boolean, now: number = Date.now()): Promise<void> {
  await updateSettings(db, { analyticsOptIn: on ? 1 : 0, analyticsChoiceAt: now })
}
