import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

/**
 * True when the OS asks for reduced motion (Android "Remove animations",
 * iOS Reduce Motion, web `prefers-reduced-motion` via react-native-web).
 *
 * Starts as `true` until the OS answers, so nothing animates for a frame on a
 * device that asked for stillness. Components use this to swap a pulse or
 * slide for a static state or an instant cut.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then(v => { if (alive) setReduced(!!v) })
      .catch(() => { if (alive) setReduced(false) })
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (v: boolean) => setReduced(!!v))
    return () => {
      alive = false
      sub?.remove?.()
    }
  }, [])

  return reduced
}
