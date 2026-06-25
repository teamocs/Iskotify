// Analytics — WEB + default implementation (posthog-js).
//
// Platform resolution: native builds use `analytics.native.ts` (posthog-react-
// native); web + the TypeScript type source use THIS file. The two files expose
// an identical API. Everything is:
//   • env-gated — a no-op unless EXPO_PUBLIC_POSTHOG_KEY is set, so the app runs
//     exactly as before until you wire a key (mirrors the Resend pattern);
//   • crash-safe — every call is wrapped so analytics can never break the app.
import posthog from 'posthog-js'

type Props = Record<string, unknown>

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let started = false

export function initAnalytics(): void {
  if (started || !KEY) return
  if (typeof window === 'undefined') return // SSR / non-browser — never init
  try {
    posthog.init(KEY, {
      api_host: HOST,
      capture_pageview: false,  // sent manually via screenView() on route change
      autocapture: true,        // DOM click/element autocapture (web only)
      persistence: 'localStorage+cookie',
      person_profiles: 'identified_only',
    })
    started = true
  } catch { /* analytics must never crash the app */ }
}

export function capture(event: string, props?: Props): void {
  try { if (started) posthog.capture(event, props) } catch { /* noop */ }
}

export function identifyUser(distinctId: string, props?: Props): void {
  try { if (started) posthog.identify(distinctId, props) } catch { /* noop */ }
}

export function screenView(name: string, props?: Props): void {
  try { if (started) posthog.capture('$pageview', { $screen_name: name, ...props }) } catch { /* noop */ }
}

export function resetAnalytics(): void {
  try { if (started) posthog.reset() } catch { /* noop */ }
}

/** True once a key is configured (whether or not init has run yet). */
export const ANALYTICS_ENABLED = !!KEY
