import { PREMIUM_ENTITLEMENT } from './entitlementRules'

// Mirrors a web purchase into RevenueCat so the Android app's RevenueCat SDK sees
// Full Access too. Best effort: public.entitlements is the source of truth.
// https://www.revenuecat.com/docs/api-v1/entitlements (grant a promotional entitlement)
export async function grantRevenueCatPromotional(appUserId: string, secretApiKey: string): Promise<{ ok: boolean; status?: number }> {
  const url =
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}` +
    `/entitlements/${PREMIUM_ENTITLEMENT}/promotional`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: 'lifetime' }),
      signal: AbortSignal.timeout(10_000),
    })
    return { ok: res.ok, status: res.status }
  } catch {
    return { ok: false }
  }
}
