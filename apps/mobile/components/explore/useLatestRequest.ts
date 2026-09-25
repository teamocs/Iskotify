import { useCallback, useEffect, useRef } from 'react'

/**
 * Request sequencing for loaders that can overlap (focus, sync settled,
 * refresh, retry). Call the returned starter when a load begins; it hands back
 * an `isCurrent()` check that stays true only while this is the newest load
 * and the component is still mounted. Apply a response only if it is current,
 * so an older read resolving late never overwrites a newer one.
 */
export function useLatestRequest(): () => () => boolean {
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return useCallback(() => {
    const id = ++generation.current
    return () => mounted.current && id === generation.current
  }, [])
}
