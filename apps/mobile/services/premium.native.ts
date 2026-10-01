// Iskotify Full Access — NATIVE store adapter (Google Play through RevenueCat).
//
// Platform resolution: Android/iOS bundles use THIS file; web uses premium.ts,
// so the web bundle never imports react-native-purchases. Both files export the
// same API (services/premiumState.ts is the only caller).
//
// RevenueCat is configured on Android only, with EXPO_PUBLIC_REVENUECAT_ANDROID_KEY.
// app_user_id is the signed-in Supabase user id (storeLogIn), so the RevenueCat
// webhook can write that account's entitlement row. RevenueCat only MAKES and
// RESTORES the purchase: its customer info never decides access (the app user
// id is client-asserted); services/premiumState.ts reads the server row for
// that. Without a key (or on iOS for now) every call is a quiet no-op.
import { Platform } from 'react-native'
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases'
import { ENTITLEMENT_ID, NETWORK_ERROR, PURCHASE_ERROR, type PurchaseOutcome } from './premiumTypes'

export type { PurchaseOutcome }

/** Which purchase path this build offers. */
export const PURCHASE_CHANNEL: 'play' | 'web' = 'play'

let configured = false
let loggedInAs: string | null = null

export function configureStore(): void {
  if (configured) return
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY
  if (Platform.OS !== 'android' || !apiKey) return
  try {
    Purchases.configure({ apiKey })
    configured = true
  } catch (e) {
    console.warn('[premium] RevenueCat configure failed:', e)
  }
}

/** True when this build can sell Full Access (Android with a RevenueCat key). */
export function storeAvailable(): boolean {
  return configured
}

/** Did Play hand back an active Full Access purchase? A hint for the restore message only. */
const foundPurchase = (info: CustomerInfo | null | undefined): boolean =>
  !!info?.entitlements?.active?.[ENTITLEMENT_ID]

/** Log RevenueCat in as the Supabase user. True once it is (a failed logIn is retried next call). */
export async function storeLogIn(userId: string): Promise<boolean> {
  if (!configured || !userId) return false
  if (loggedInAs === userId) return true
  try {
    await Purchases.logIn(userId)
    loggedInAs = userId
    return true
  } catch (e) {
    console.warn('[premium] RevenueCat logIn failed:', e)
    return false
  }
}

/**
 * A purchase or restore must be attributed to THIS account: log in, then check
 * RevenueCat really is on that user (a failed or raced logIn would leave the
 * previous or an anonymous user, whose webhook would grant the wrong account).
 */
async function storeIsUser(userId: string): Promise<boolean> {
  if (!(await storeLogIn(userId))) return false
  try {
    return (await Purchases.getAppUserID()) === userId
  } catch (e) {
    console.warn('[premium] getAppUserID failed:', e)
    return false
  }
}

/** Sign-out, account switch or delete: the next person on this device is anonymous to RevenueCat. */
export async function storeLogOut(): Promise<void> {
  loggedInAs = null
  if (!configured) return
  try {
    if (await Purchases.isAnonymous()) return // logOut throws for an anonymous user
    await Purchases.logOut()
  } catch (e) {
    console.warn('[premium] RevenueCat logOut failed:', e)
  }
}

async function currentPackage(): Promise<PurchasesPackage | null> {
  const offerings = await Purchases.getOfferings()
  return offerings.current?.availablePackages?.[0] ?? null
}

/** The localized Play price of Full Access (e.g. "₱500.00"); null when unknown. */
export async function getFullAccessPrice(): Promise<string | null> {
  if (!configured) return null
  try {
    return (await currentPackage())?.product.priceString ?? null
  } catch (e) {
    console.warn('[premium] getOfferings failed:', e)
    return null
  }
}

function isCancelled(e: unknown): boolean {
  const err = e as { userCancelled?: boolean | null; code?: unknown } | null
  return !!err && (err.userCancelled === true || err.code === Purchases.PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
}

/** Buy Full Access through Google Play as the signed-in student. */
export async function purchaseFullAccess(userId: string): Promise<PurchaseOutcome> {
  if (!userId) return { status: 'signed_out' }
  if (!configured) return { status: 'error', message: PURCHASE_ERROR }
  if (!(await storeIsUser(userId))) { loggedInAs = null; return { status: 'error', message: NETWORK_ERROR } }
  let pkg: PurchasesPackage | null
  try {
    pkg = await currentPackage()
  } catch (e) {
    console.warn('[premium] getOfferings failed:', e)
    return { status: 'error', message: NETWORK_ERROR }
  }
  if (!pkg) return { status: 'error', message: PURCHASE_ERROR }
  try {
    // Google Play took the payment (or queued a pending one). Access itself is
    // granted only when the webhook writes the entitlement row (confirmPurchase).
    await Purchases.purchasePackage(pkg)
    return { status: 'success' }
  } catch (e) {
    if (isCancelled(e)) return { status: 'cancelled' }
    console.warn('[premium] purchase failed:', e)
    return { status: 'error', message: PURCHASE_ERROR }
  }
}

/** Restore a Google Play purchase made earlier (new phone, reinstall). */
export async function restoreFullAccess(userId: string): Promise<PurchaseOutcome> {
  if (!userId) return { status: 'signed_out' }
  if (!configured) return { status: 'error', message: PURCHASE_ERROR }
  if (!(await storeIsUser(userId))) { loggedInAs = null; return { status: 'error', message: NETWORK_ERROR } }
  try {
    // Only tells the student whether Play found a purchase; the row decides access.
    const info = await Purchases.restorePurchases()
    return foundPurchase(info) ? { status: 'success' } : { status: 'nothing_to_restore' }
  } catch (e) {
    console.warn('[premium] restore failed:', e)
    return { status: 'error', message: NETWORK_ERROR }
  }
}
