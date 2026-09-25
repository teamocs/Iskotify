import { useCallback, useEffect, useMemo, useRef } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { router, usePathname } from 'expo-router'

// Swipe order follows the tab bar: Today · Practice · Explore · Progress.
// Profile is not a tab (it opens from the header avatar), so it is not in the
// swipe sequence. The Today↔Notes swipe (below) is intentionally separate.
const TAB_PATHS = ['/', '/practice', '/explore', '/progress'] as const
const TAB_HREFS = [
  '/(tabs)',
  '/(tabs)/practice',
  '/(tabs)/explore',
  '/(tabs)/progress',
] as const

const NOTES_PATH = '/notes'
const SWIPE_DISTANCE = 50
const SWIPE_VELOCITY = 300

/**
 * `enabled` turns the swipe off without changing the tree (the tab layout keeps
 * one navigator mounted across breakpoints; beside the desktop sidebar a
 * horizontal drag should select text, not change tabs).
 */
export function EdgeSwipeNavigator({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const pathname = usePathname()

  // Read the live pathname from a ref so `navigateTo` and the Pan gesture stay
  // referentially stable. Previously both were rebuilt on every route change
  // (pathname dep), which tore down and re-attached the native gesture handler on
  // each navigation — adding latency to taps/navigation across the whole app.
  const pathnameRef = useRef(pathname)
  useEffect(() => { pathnameRef.current = pathname }, [pathname])

  const navigateTo = useCallback((direction: 'left' | 'right') => {
    const current = pathnameRef.current
    // Home ↔ Notes swipe
    if (direction === 'right' && current === '/') {
      router.navigate(NOTES_PATH as never)
      return
    }
    if (direction === 'left' && current === NOTES_PATH) {
      router.back()
      return
    }
    // Standard tab swipe
    const idx = (TAB_PATHS as readonly string[]).indexOf(current)
    if (idx === -1) return
    const next = direction === 'left' ? idx + 1 : idx - 1
    if (next < 0 || next >= TAB_HREFS.length) return
    router.navigate(TAB_HREFS[next] as never)
  }, [])

  const pan = useMemo(() =>
    Gesture.Pan()
      .enabled(enabled)
      .activeOffsetX([-15, 15])
      .failOffsetY([-15, 15])
      .onEnd((e) => {
        'worklet'
        const swipeLeft = e.translationX < -SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
        const swipeRight = e.translationX > SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
        if (swipeLeft) runOnJS(navigateTo)('left')
        else if (swipeRight) runOnJS(navigateTo)('right')
      }),
  [navigateTo, enabled])

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  )
}
