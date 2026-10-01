// Analytics — WEB + default implementation (posthog-js).
//
// Platform resolution: native builds use `analytics.native.ts` (posthog-react-
// native); web + the TypeScript type source use THIS file. The two files expose
// an identical API. Everything is:
//   • consent-gated — nothing is initialised or sent until setAnalyticsConsent(true)
//     (RA 10173: minors opt in, adults may opt out; services/analyticsConsent.ts
//     derives the value from the stored choice and age band). Switching it off
//     opts the SDK out, turns autocapture off and forgets the identity;
//   • env-gated — a no-op unless EXPO_PUBLIC_POSTHOG_KEY is set, so the app runs
//     exactly as before until you wire a key (mirrors the Resend pattern);
//   • crash-safe — every call is wrapped so analytics can never break the app.
import posthog from 'posthog-js'

type Props = Record<string, unknown>

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

let started = false
let allowed = false
// An account id seen while analytics is not allowed. Held in memory only and
// sent after consent; never persisted and never sent without it.
let heldId: string | null = null

export function initAnalytics(): void {
  if (started || !KEY || !allowed) return
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
    // A previous session may have persisted an opt-out; consent is on now.
    posthog.opt_in_capturing()
  } catch { /* analytics must never crash the app */ }
}

/**
 * Apply the student's analytics consent. true starts (or resumes) analytics;
 * false stops it immediately: SDK opt-out, autocapture off, identity dropped.
 */
export function setAnalyticsConsent(next: boolean): void {
  try {
    if (next) {
      if (allowed && started) return // already on: re-applying sends nothing new
      allowed = true
      if (!started) initAnalytics()
      else {
        posthog.opt_in_capturing()
        posthog.set_config({ autocapture: true })
      }
      if (started && heldId) posthog.identify(heldId)
    } else {
      allowed = false
      heldId = null
      if (started) {
        posthog.opt_out_capturing()
        posthog.set_config({ autocapture: false })
        posthog.reset()
      }
    }
  } catch { /* noop */ }
}

export function capture(event: string, props?: Props): void {
  try { if (started && allowed) posthog.capture(event, props) } catch { /* noop */ }
}

/**
 * Ties later events to a signed-in account by its ID ONLY. Deliberately takes no
 * properties: no email, name or other personal data may reach PostHog (the
 * privacy policy promises this; lib/__tests__/analyticsIdentity.test.ts guards it).
 * Until analytics is allowed the id is only held in memory.
 */
export function identifyUser(distinctId: string): void {
  heldId = distinctId
  try { if (started && allowed) posthog.identify(distinctId) } catch { /* noop */ }
}

export function screenView(name: string, props?: Props): void {
  try { if (started && allowed) posthog.capture('$pageview', { $screen_name: name, ...props }) } catch { /* noop */ }
}

/**
 * Sign-out, account switch or a data reset: forget the identity AND switch
 * analytics off. The next person on this device is asked afresh, so nothing is
 * sent (and an id is only held) until their own stored consent is applied.
 */
export function resetAnalytics(): void {
  setAnalyticsConsent(false)
}

/** True once a key is configured (whether or not consent has been given). */
export const ANALYTICS_ENABLED = !!KEY
