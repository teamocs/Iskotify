// Analytics — NATIVE implementation (posthog-react-native).
//
// Mirrors the API in `analytics.ts` (web/default). The SDK is required LAZILY
// inside initAnalytics so merely importing this module never loads posthog-react-
// native (keeps Jest + cold start clean); it only loads when a key is configured
// and init runs. Env-gated + crash-safe, same as the web file.
import type PostHog from 'posthog-react-native'

type Props = Record<string, unknown>

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let client: PostHog | null = null

export function initAnalytics(): void {
  if (client || !KEY) return
  try {
    // Lazy require: not evaluated in tests / when no key is set.
    const PostHogCtor = require('posthog-react-native').default as typeof PostHog
    client = new PostHogCtor(KEY, { host: HOST, captureAppLifecycleEvents: true })
  } catch { /* analytics must never crash the app */ }
}

export function capture(event: string, props?: Props): void {
  try { client?.capture(event, props as Record<string, any>) } catch { /* noop */ }
}

export function identifyUser(distinctId: string, props?: Props): void {
  try { client?.identify(distinctId, props as Record<string, any>) } catch { /* noop */ }
}

export function screenView(name: string, props?: Props): void {
  try { client?.screen(name, props as Record<string, any>) } catch { /* noop */ }
}

export function resetAnalytics(): void {
  try { client?.reset() } catch { /* noop */ }
}

/** True once a key is configured (whether or not init has run yet). */
export const ANALYTICS_ENABLED = !!KEY
