import { useEffect, useState } from 'react'
import { Platform } from 'react-native'
import { useDb } from './useDb'
import { isSignedOutWebGuest } from '../services/guestSession'
import { startGuestPreview } from '../services/guestPreview'

/**
 * The web glimpse (P4): who is on a guest route.
 *  - 'checking': not known yet (web only, one local read);
 *  - 'member':   signed in, or native (native never has web guests);
 *  - 'guest':    a signed-out web visitor; this browser is prepared for them
 *                (services/guestPreview.ts) and `catalogReady` turns true once
 *                the catalog sync has settled;
 *  - 'held':     signed out, but this browser still holds an account that
 *                signed out, so the preview is not offered here.
 */
export type GuestMode = 'checking' | 'member' | 'guest' | 'held'

export function useGuestMode(): { mode: GuestMode; catalogReady: boolean } {
  const db = useDb()
  const web = Platform.OS === 'web'
  const [mode, setMode] = useState<GuestMode>(web ? 'checking' : 'member')
  const [catalogReady, setCatalogReady] = useState(!web)

  useEffect(() => {
    if (!web) return
    let alive = true
    void (async () => {
      try {
        if (!(await isSignedOutWebGuest())) {
          if (alive) { setMode('member'); setCatalogReady(true) }
          return
        }
        const { state, catalog } = await startGuestPreview(db)
        if (!alive) return
        setMode(state)
        await catalog
        if (alive) setCatalogReady(true)
      } catch (e) {
        // The device could not be read: show nothing a guest could write into.
        console.warn('[guest] could not prepare the preview:', e)
        if (alive) { setMode('held'); setCatalogReady(true) }
      }
    })()
    return () => { alive = false }
  }, [db, web])

  return { mode, catalogReady }
}
