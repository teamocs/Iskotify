/**
 * Consent rules (P1b), kept pure so every screen, gate and sync path shares one
 * definition. Nothing here touches the database or the UI.
 *
 *  - Terms/Privacy consent: age band + the version of the texts accepted. Under-18s
 *    also record a parent/guardian attestation.
 *  - Sensitive-data consent: separate, opt-in, withdrawable (grades, income,
 *    Indigenous status).
 *  - Analytics consent: off for minors until they opt in, on for adults until
 *    they opt out, and never before any consent exists.
 */
import type { IncomeBracket } from './scholarshipMatch'

/** Bump when the Terms or Privacy Policy change in a way that needs fresh consent. ISO date, compared as text. */
export const CONSENT_VERSION = '2026-10-01'

export type AgeBand = 'adult' | 'minor'

export interface ConsentRecord {
  ageBand: string
  consentVersion: string
  consentedAt: number
  guardianConsentAt: number
}

export interface ConsentSnapshot extends ConsentRecord {
  sensitiveConsentAt: number
  /** When sensitive consent was last withdrawn (or declined), epoch ms; 0 = never. */
  sensitiveWithdrawnAt: number
  analyticsOptIn: number | null
  /** When the analytics switch was last set, epoch ms; 0 = never chosen. */
  analyticsChoiceAt: number
}

/** The settings written when the student accepts the current Terms and Privacy Policy. */
export function consentPatch(ageBand: AgeBand, now: number = Date.now()): ConsentRecord {
  return {
    ageBand,
    consentVersion: CONSENT_VERSION,
    consentedAt: now,
    guardianConsentAt: ageBand === 'minor' ? now : 0,
  }
}

function isAgeBand(v: unknown): v is AgeBand {
  return v === 'adult' || v === 'minor'
}

/** True when the stored consent covers the current texts (and, for a minor, a guardian). */
export function isConsentCurrent(c: Partial<ConsentRecord>): boolean {
  if (!isAgeBand(c.ageBand)) return false
  if (!c.consentedAt || c.consentedAt <= 0) return false
  if (!c.consentVersion || c.consentVersion < CONSENT_VERSION) return false
  if (c.ageBand === 'minor' && !((c.guardianConsentAt ?? 0) > 0)) return false
  return true
}

// Routes that must open without a current consent: the consent screens themselves
// (update screen, onboarding), the signed-out entry screens and the legal pages
// they link to. Everything else is gated (components/consent/ConsentGate.tsx).
const CONSENT_EXEMPT = ['/consent', '/onboarding', '/landing', '/terms', '/privacy']

/** True for a route a student may open before agreeing to the current Terms. */
export function isConsentExemptPath(pathname: string): boolean {
  const p = pathname.split(/[?#]/)[0] ?? '/'
  const path = p.length > 1 ? p.replace(/\/+$/, '') : p
  return CONSENT_EXEMPT.includes(path) || path.startsWith('/auth/')
}

/** Short reason the consent form cannot continue yet, or null when it is valid. */
export function consentFormReason(f: { ageBand: AgeBand | null; terms: boolean; guardian: boolean }): string | null {
  if (!f.ageBand) return 'Choose your age to continue.'
  if (!f.terms) return 'Tick that you have read the Terms and the Privacy Policy.'
  if (f.ageBand === 'minor' && !f.guardian) return 'Your parent or guardian needs to agree. Tick the last box once they have.'
  return null
}

/** Analytics default for an age band: minors opt in, adults opt out. */
export function analyticsDefault(ageBand: string): boolean {
  return ageBand === 'adult'
}

/** Whether analytics may run. Never before consent exists. */
export function analyticsAllowed(s: { ageBand?: string; consentedAt?: number; analyticsOptIn?: number | null }): boolean {
  if (!isAgeBand(s.ageBand) || !((s.consentedAt ?? 0) > 0)) return false
  if (s.analyticsOptIn === 1) return true
  if (s.analyticsOptIn === 0) return false
  return analyticsDefault(s.ageBand)
}

export function hasSensitiveConsent(s: { sensitiveConsentAt?: number | null }): boolean {
  return (s.sensitiveConsentAt ?? 0) > 0
}

/**
 * Clears every sensitive column and the consent. A student's own withdrawal (or
 * decline) also needs its time stamped: use sensitiveWithdrawal().
 */
export const SENSITIVE_CLEARED = {
  incomeBracket: null,
  gwa: null,
  hsGwaG8: null,
  hsGwaG9: null,
  hsGwaG10: null,
  hsGwaG11: null,
  isIndigenous: false,
  sensitiveConsentAt: 0,
} as const

/** The student withdraws (or declines) sensitive-data consent: details cleared, time stamped. */
export function sensitiveWithdrawal(now: number = Date.now()) {
  return { ...SENSITIVE_CLEARED, sensitiveWithdrawnAt: now }
}

interface SensitiveFields {
  incomeBracket?: IncomeBracket | string | null
  gwa?: number | null
  hsGwaG8?: number | null
  hsGwaG9?: number | null
  hsGwaG10?: number | null
  hsGwaG11?: number | null
  isIndigenous?: boolean | null
  sensitiveConsentAt?: number | null
}

/**
 * The profile a feature may use: without sensitive consent, income, grades and
 * Indigenous status read as "not provided", even if values are still stored.
 */
export function gateSensitive<T extends SensitiveFields>(s: T): T {
  if (hasSensitiveConsent(s)) return s
  return {
    ...s,
    incomeBracket: null, gwa: null, hsGwaG8: null, hsGwaG9: null, hsGwaG10: null, hsGwaG11: null,
    isIndigenous: false,
  }
}

function hasRecord(c: ConsentSnapshot): boolean {
  return !!c.consentVersion && c.consentedAt > 0
}

function termsOf(c: ConsentSnapshot): ConsentRecord {
  return { ageBand: c.ageBand, consentVersion: c.consentVersion, consentedAt: c.consentedAt, guardianConsentAt: c.guardianConsentAt }
}

/**
 * Reconcile the consent stored on this device with the one in the cloud backup.
 * Each part is decided on its own, so no device can bring back a choice the
 * student already changed elsewhere:
 *  - Terms record (age band, version, dates): the newer version wins, then the
 *    later acceptance.
 *  - Sensitive-data consent: the latest event wins, grant (sensitiveConsentAt)
 *    vs withdrawal (sensitiveWithdrawnAt), across both sides. Both timestamps
 *    are kept, so a withdrawal survives any number of stale copies.
 *  - Analytics: the latest choice (analyticsChoiceAt) wins.
 * A full tie keeps this device's value (the backup's when this device has none):
 * both copies came from the same event, and the protective result of a first
 * sign-in merge must survive the push that follows it.
 *
 * `merging` is the first sign-in of a device that never pulled for this account.
 * There the most protective value wins: a minor on either side stays a minor
 * (with the guardian attestation that came with it), and an explicit analytics
 * "off" on either side wins.
 */
export function mergeConsent(local: ConsentSnapshot, remote: ConsentSnapshot, merging = false): ConsentSnapshot {
  let terms: ConsentRecord
  if (!hasRecord(remote)) terms = termsOf(local)
  else if (!hasRecord(local)) terms = termsOf(remote)
  else {
    const remoteNewer = remote.consentVersion > local.consentVersion ||
      (remote.consentVersion === local.consentVersion && remote.consentedAt > local.consentedAt)
    terms = termsOf(remoteNewer ? remote : local)
  }
  if (merging && terms.ageBand !== 'minor') {
    const minorSide = [local, remote].find(c => hasRecord(c) && c.ageBand === 'minor')
    if (minorSide) terms = { ...terms, ageBand: 'minor', guardianConsentAt: minorSide.guardianConsentAt }
  }

  const granted = Math.max(local.sensitiveConsentAt, remote.sensitiveConsentAt)
  const withdrawn = Math.max(local.sensitiveWithdrawnAt, remote.sensitiveWithdrawnAt)

  let analyticsOptIn: number | null
  let analyticsChoiceAt: number
  if (merging && (local.analyticsOptIn === 0 || remote.analyticsOptIn === 0)) {
    analyticsOptIn = 0
    analyticsChoiceAt = Math.max(local.analyticsChoiceAt, remote.analyticsChoiceAt)
  } else if (local.analyticsChoiceAt > remote.analyticsChoiceAt) {
    ({ analyticsOptIn, analyticsChoiceAt } = local)
  } else if (remote.analyticsChoiceAt > local.analyticsChoiceAt) {
    ({ analyticsOptIn, analyticsChoiceAt } = remote)
  } else {
    analyticsOptIn = local.analyticsOptIn ?? remote.analyticsOptIn
    analyticsChoiceAt = local.analyticsChoiceAt
  }

  return {
    ...terms,
    sensitiveConsentAt: granted > withdrawn ? granted : 0,
    sensitiveWithdrawnAt: withdrawn,
    analyticsOptIn,
    analyticsChoiceAt,
  }
}
