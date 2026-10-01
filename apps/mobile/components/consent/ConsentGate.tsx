import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { router, usePathname } from 'expo-router'
import { useDb } from '../../hooks/useDb'
import { focusListings } from '../../db/schema'
import { getSettings } from '../../services/settings'
import { setAnalyticsConsent } from '../../lib/analytics'
import { analyticsAllowed, isConsentCurrent, isConsentExemptPath } from '../../utils/consent'
import { hasOnboardingFocus } from '../../utils/onboardingStatus'
import { useTheme } from '../../theme/ThemeContext'

type Status = 'checking' | 'ok' | 'needed'

/**
 * Mounted once at the root (app/_layout.tsx), so it covers every route, deep
 * links included, not just the tabs. An onboarded student whose consent does
 * not cover the current Terms and Privacy Policy (finished onboarding before
 * consent existed, the texts changed, or a minor with no guardian attestation)
 * is sent to the one-time update screen. Students still onboarding are left to
 * onboarding, which asks for consent on its first step.
 *
 * The check re-runs on every route change (one local read). Until the first
 * answer, and while consent is known to be missing, the route is covered so it
 * never flashes. A settings read that fails lets the student in: never locked out.
 * `enabled` waits for the launch routing (AppInit) so the two never race.
 */
export function ConsentGate({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const db = useDb()
  const pathname = usePathname()
  const { theme: t } = useTheme()
  const [status, setStatus] = useState<Status>('checking')
  const exempt = isConsentExemptPath(pathname)

  useEffect(() => {
    if (!enabled || exempt) return
    let alive = true
    void (async () => {
      let next: Status = 'ok'
      let analytics = false
      try {
        const [s, focusRows] = await Promise.all([getSettings(db), db.select().from(focusListings).limit(1)])
        const onboarded = !!s.fullName?.trim() && hasOnboardingFocus({
          selectedListingSlug: s.selectedListingSlug,
          focusCount: focusRows.length,
          targetExams: s.targetExams,
        })
        if (onboarded && !isConsentCurrent(s)) next = 'needed'
        // Consent may have just arrived (or gone) with a restored backup or an
        // account switch: analytics follows the stored choice either way.
        analytics = analyticsAllowed(s)
      } catch (e) {
        console.warn('[consent] could not check consent (not blocking, analytics off):', e)
      }
      if (!alive) return
      setAnalyticsConsent(analytics)
      setStatus(next)
      if (next === 'needed') router.replace('/consent')
    })()
    return () => { alive = false }
  }, [db, enabled, exempt, pathname])

  const cover = enabled && !exempt && status !== 'ok'
  return (
    <>
      {children}
      {cover ? <View testID="consent-gate-cover" style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} /> : null}
    </>
  )
}
