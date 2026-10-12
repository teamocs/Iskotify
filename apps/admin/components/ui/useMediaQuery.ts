'use client'

import { useSyncExternalStore } from 'react'

/** Tailwind's `xl`: from here an inspector Drawer docks beside the list instead of covering it. */
export const INSPECTOR_QUERY = '(min-width: 1280px)'

/**
 * Whether a media query matches. False on the server and during hydration
 * (the getServerSnapshot), so server markup is the narrow layout and the
 * client switches after hydrating without a mismatch.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}
