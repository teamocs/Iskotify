import { useEffect } from 'react'
import { Platform } from 'react-native'
import { flushWebPersist } from '../db/webPersist'

/**
 * Review finding #3 (MEDIUM) — web has no beforeunload handling, so
 * db/webPersist.ts's ~2s debounced IndexedDB persist can lose the latest
 * answer if the student closes/reloads the tab mid-exam before it fires (the
 * existing visibilitychange/pagehide flush in db/web/openWebDatabase.ts is
 * best-effort background work; it cannot warn the student first).
 *
 * While `shouldWarn` is true (i.e. `phase === 'exam'`) and running on web,
 * this shows the browser's native "leave site?" prompt AND forces an
 * immediate flush (bypassing the debounce) as a belt-and-suspenders backup
 * to that existing flush. No-op on native — `window`/`beforeunload` don't
 * exist there.
 */
export function useBeforeUnloadWarning(shouldWarn: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !shouldWarn) return
    if (typeof window === 'undefined') return

    function handler(e: BeforeUnloadEvent) {
      flushWebPersist()
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    // Guarded (not a bare `window.removeEventListener`) so cleanup can never
    // throw if `window` has already gone away by the time it runs.
    return () => { if (typeof window !== 'undefined') window.removeEventListener('beforeunload', handler) }
  }, [shouldWarn])
}
