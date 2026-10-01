import { useSyncExternalStore } from 'react'
import { getPremiumSnapshot, subscribePremium, refreshPremium } from '../services/premiumState'

/**
 * Iskotify Full Access for this student.
 *  - enabled: the paywall flag (EXPO_PUBLIC_PAYWALL_ENABLED). Off: no limits and
 *    no upgrade UI anywhere; render nothing premium-related.
 *  - isPremium: the signed-in student has Full Access.
 *  - unlimited: no limit applies (flag off, or Full Access).
 *  - loading: the first answer is not in yet (gates fail open meanwhile).
 */
export function usePremium() {
  const s = useSyncExternalStore(subscribePremium, getPremiumSnapshot, getPremiumSnapshot)
  return { ...s, refresh: refreshPremium }
}
