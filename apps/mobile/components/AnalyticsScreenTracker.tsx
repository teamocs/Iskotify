import { useEffect } from 'react'
import { usePathname } from 'expo-router'
import { screenView } from '../lib/analytics'

// Fires a PostHog screen/pageview whenever the active route changes. Rendered
// once inside the root layout's navigation tree. No-op until a key is set.
export function AnalyticsScreenTracker() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) screenView(pathname)
  }, [pathname])
  return null
}
