/** What a purchase / restore attempt came to. Shared by premium.ts (web) and premium.native.ts. */
export type PurchaseOutcome =
  | { status: 'success' }
  /** The student backed out of the store sheet: say nothing. */
  | { status: 'cancelled' }
  /** Web: the browser is on its way to the checkout page. */
  | { status: 'redirecting' }
  | { status: 'already_premium' }
  | { status: 'nothing_to_restore' }
  | { status: 'signed_out' }
  | { status: 'error'; message: string }

/** RevenueCat entitlement id for Iskotify Full Access. */
export const ENTITLEMENT_ID = 'premium'

export const PURCHASE_ERROR =
  "We couldn't finish the purchase. Please try again."
export const NETWORK_ERROR =
  "We couldn't reach the payment service. Check your connection and try again."
