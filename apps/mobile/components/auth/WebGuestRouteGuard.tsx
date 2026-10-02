import { useEffect } from 'react'
import { Platform } from 'react-native'
import { router, usePathname } from 'expo-router'
import { webGateRedirect } from '../../utils/webEntryTarget'
import { isSignedOutWebGuest } from '../../services/guestSession'

/**
 * The web glimpse (P4). The entry gate (webEntryGate.ts) decides the route on a
 * page load and on auth events only, so a signed-out visitor on the guest
 * diagnostic could follow an in-app link anywhere. This re-applies the same
 * signed-out allowlist (webGateRedirect) on every route change: guest routes,
 * auth pages and the legal pages stay; everything else goes to sign-in.
 * Web only; `enabled` waits for the launch routing so the two never race.
 */
export function WebGuestRouteGuard({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return
    let alive = true
    void (async () => {
      if (!(await isSignedOutWebGuest())) return
      const href = webGateRedirect(pathname, '/auth/sign-in')
      if (alive && href) router.replace(href)
    })()
    return () => { alive = false }
  }, [enabled, pathname])
  return null
}
