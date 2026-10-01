// Analytics — NATIVE implementation (posthog-react-native).
//
// Mirrors the API in `analytics.ts` (web/default). The SDK is required LAZILY
// so merely importing this module never loads posthog-react-native (keeps Jest
// + cold start clean); it only loads when a key is configured AND the student's
// analytics consent allows it. Consent-gated, env-gated and crash-safe, same as
// the web file.
import type PostHog from 'posthog-react-native'

type Props = Record<string, unknown>

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let client: PostHog | null = null
let allowed = false
// See the web file: held in memory only, sent after consent.
let heldId: string | null = null

export function initAnalytics(): void {
  if (client || !KEY || !allowed) return
  try {
    // Lazy require: not evaluated in tests / when no key is set / before consent.
    const PostHogCtor = require('posthog-react-native').default as typeof PostHog
    client = new PostHogCtor(KEY, { host: HOST, captureAppLifecycleEvents: true })
    // A previous session may have persisted an opt-out; consent is on now.
    client.optIn()
  } catch { /* analytics must never crash the app */ }
}

/** Apply the student's analytics consent. See the web file. */
export function setAnalyticsConsent(next: boolean): void {
  try {
    if (next) {
      if (allowed && client) return // already on: re-applying sends nothing new
      allowed = true
      if (!client) initAnalytics()
      else client.optIn()
      if (client && heldId) client.identify(heldId)
    } else {
      allowed = false
      heldId = null
      if (client) {
        client.optOut()
        client.reset()
      }
    }
  } catch { /* noop */ }
}

export function capture(event: string, props?: Props): void {
  try { if (allowed) client?.capture(event, props as Record<string, any>) } catch { /* noop */ }
}

/** Account ID only, never personal properties. See the web file. */
export function identifyUser(distinctId: string): void {
  heldId = distinctId
  try { if (allowed) client?.identify(distinctId) } catch { /* noop */ }
}

export function screenView(name: string, props?: Props): void {
  try { if (allowed) client?.screen(name, props as Record<string, any>) } catch { /* noop */ }
}

/** Forget the identity and switch analytics off. See the web file. */
export function resetAnalytics(): void {
  setAnalyticsConsent(false)
}

/** True once a key is configured (whether or not consent has been given). */
export const ANALYTICS_ENABLED = !!KEY
