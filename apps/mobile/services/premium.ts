// Iskotify Full Access — WEB store adapter (PayMongo through the admin host).
//
// Platform resolution: native builds use premium.native.ts (RevenueCat / Google
// Play); web + the TypeScript type source use THIS file, which never imports
// react-native-purchases. Same exported API on both.
//
// On web there is no store to ask: Full Access is the server entitlement row
// (services/entitlements.ts), which a Play or a PayMongo purchase both set.
import { requestCheckout } from './entitlements'
import { NETWORK_ERROR, PURCHASE_ERROR, type PurchaseOutcome } from './premiumTypes'

export type { PurchaseOutcome }

export const PURCHASE_CHANNEL: 'play' | 'web' = 'web'

/** The one-time web price, in pesos. */
export const WEB_PRICE_LABEL = '₱500'

export function configureStore(): void { /* nothing to configure on web */ }

export function storeAvailable(): boolean {
  return true
}

export async function storeLogIn(_userId: string): Promise<void> { /* no store identity on web */ }

export async function storeLogOut(): Promise<void> { /* no store identity on web */ }

export async function getFullAccessPrice(): Promise<string | null> {
  return WEB_PRICE_LABEL
}

/**
 * Start a PayMongo checkout (GCash, Maya or card): ask the admin host for a
 * checkout link and send the browser there. PayMongo brings the student back to
 * /upgrade?status=success (or cancelled).
 */
export async function startCheckout(): Promise<PurchaseOutcome> {
  const res = await requestCheckout()
  if (res.ok) {
    try {
      window.location.assign(res.checkoutUrl)
      return { status: 'redirecting' }
    } catch (e) {
      console.warn('[premium] could not open checkout:', e)
      return { status: 'error', message: PURCHASE_ERROR }
    }
  }
  switch (res.reason) {
    case 'signed_out': return { status: 'signed_out' }
    case 'already_premium': return { status: 'already_premium' }
    case 'network': return { status: 'error', message: NETWORK_ERROR }
    case 'payments_disabled':
      return { status: 'error', message: 'Payments are paused for a moment. Please try again later.' }
    default: return { status: 'error', message: PURCHASE_ERROR }
  }
}

export async function purchaseFullAccess(userId: string): Promise<PurchaseOutcome> {
  if (!userId) return { status: 'signed_out' }
  return startCheckout()
}

/** Nothing to restore on web: the entitlement row is read on every refresh. */
export async function restoreFullAccess(userId: string): Promise<PurchaseOutcome> {
  if (!userId) return { status: 'signed_out' }
  return { status: 'nothing_to_restore' }
}
