import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { View } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { runOnJS, useAnimatedScrollHandler, useSharedValue, type SharedValue } from 'react-native-reanimated'

// ---------------------------------------------------------------------------
// The floating tab bar's link to the screens under it:
// - scrollY: the focused screen's offset (every tab screen's scroll view
//   feeds it through useTabBarScrollHandler);
// - minimized: the capsule's collapsed state, decided on the UI thread from
//   the scroll and mirrored to React only when it flips;
// - blur targets (Android): each scene's BlurTargetView ref, so the bar's
//   <Glass> can blur the content of the focused tab.
// Screens outside the tab navigator get no provider and every hook here is
// a no-op for them.
// ---------------------------------------------------------------------------

/** Scrolling down past this (pt) with a positive delta minimizes the bar. */
export const MINIMIZE_AFTER = 140
/** Within this distance of the top (pt) the bar is always expanded. */
export const EXPAND_NEAR_TOP = 80
/** Deltas smaller than this (pt) are jitter, not a direction. */
const JITTER = 2

/** Next minimized state for a scroll sample. A worklet: runs on the UI thread. */
export function nextMinimized(prev: boolean, y: number, dy: number): boolean {
  'worklet'
  if (y < EXPAND_NEAR_TOP) return false
  if (dy < -JITTER) return false
  if (dy > JITTER && y > MINIMIZE_AFTER) return true
  return prev
}

interface TabBarScrollValue {
  scrollY: SharedValue<number>
  minimizedSV: SharedValue<boolean>
  minimized: boolean
  setMinimized: (v: boolean) => void
  /** The bar draws the search field (compact / medium); the Search screen
   *  then leaves out its own. False beside the desktop sidebar. */
  barHostsSearch: boolean
  registerBlurTarget: (routeKey: string, ref: RefObject<View | null> | null) => void
  blurTargetFor: (routeKey: string | undefined) => RefObject<View | null> | undefined
}

const TabBarScrollContext = createContext<TabBarScrollValue | null>(null)

export function TabBarScrollProvider({ children, barHostsSearch = true }: { children: ReactNode; barHostsSearch?: boolean }) {
  const scrollY = useSharedValue(0)
  const minimizedSV = useSharedValue(false)
  const [minimized, setMinimizedState] = useState(false)
  const targets = useRef(new Map<string, RefObject<View | null>>())
  // Bumped when a scene registers its target, so the bar re-reads the map.
  const [, setTargetsVersion] = useState(0)

  // Stable for the provider's lifetime: consumers key effects on it.
  const minimizedRef = useRef(minimizedSV)
  minimizedRef.current = minimizedSV
  const setMinimized = useCallback((v: boolean) => {
    minimizedRef.current.value = v
    setMinimizedState(v)
  }, [])

  const registerBlurTarget = useCallback((routeKey: string, ref: RefObject<View | null> | null) => {
    if (ref) targets.current.set(routeKey, ref)
    else targets.current.delete(routeKey)
    setTargetsVersion(n => n + 1)
  }, [])

  const blurTargetFor = useCallback((routeKey: string | undefined) => (
    routeKey ? targets.current.get(routeKey) : undefined
  ), [])

  const value = useMemo<TabBarScrollValue>(() => ({
    scrollY, minimizedSV, minimized, setMinimized, barHostsSearch, registerBlurTarget, blurTargetFor,
  }), [scrollY, minimizedSV, minimized, setMinimized, barHostsSearch, registerBlurTarget, blurTargetFor])

  return <TabBarScrollContext.Provider value={value}>{children}</TabBarScrollContext.Provider>
}

/** The bar's scroll state, or null outside the tab navigator. */
export function useTabBarScroll(): TabBarScrollValue | null {
  return useContext(TabBarScrollContext)
}

/**
 * The scroll handler a tab screen's Animated scroll view (ScrollView or
 * FlatList) passes as `onScroll` (with scrollEventThrottle 16). It writes the
 * offset to `localY` (the screen's own large-title header) and to the bar's
 * shared scrollY, and flips the bar's minimized state. Runs on the UI thread.
 */
export function useTabBarScrollHandler(localY?: SharedValue<number>) {
  const ctx = useContext(TabBarScrollContext)
  const fallbackY = useSharedValue(0)
  const fallbackMin = useSharedValue(false)
  const lastY = useSharedValue(0)
  const sharedY = ctx?.scrollY ?? fallbackY
  const minimizedSV = ctx?.minimizedSV ?? fallbackMin
  const setMinimized = ctx?.setMinimized
  const ownY = localY ?? fallbackY

  return useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y
      const dy = y - lastY.value
      lastY.value = y
      ownY.value = y
      sharedY.value = y
      if (!setMinimized) return
      const next = nextMinimized(minimizedSV.value, y, dy)
      if (next !== minimizedSV.value) {
        minimizedSV.value = next
        runOnJS(setMinimized)(next)
      }
    },
  }, [setMinimized])
}

interface ScrollableRef {
  scrollTo?: (opts: { x?: number; y?: number; animated?: boolean }) => void
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void
}

/**
 * Re-pressing the tab you are on scrolls it to the top (the bar emits
 * `tabPress` and does not navigate). Like React Navigation's useScrollToTop,
 * but a no-op outside a navigator (tests, previews) and only for a screen
 * that is itself a tab.
 */
export function useScrollToTopOnReselect(ref: RefObject<ScrollableRef | null>) {
  const navigation = useContext(NavigationContext)
  useEffect(() => {
    if (!navigation) return
    const type = (navigation.getState?.() as { type?: string } | undefined)?.type
    if (type !== 'tab') return
    const unsubscribe = (navigation.addListener as unknown as (
      e: 'tabPress', cb: (ev: { defaultPrevented?: boolean }) => void,
    ) => () => void)('tabPress', (ev) => {
      if (!navigation.isFocused() || ev.defaultPrevented) return
      requestAnimationFrame(() => {
        const r = ref.current
        if (r?.scrollToOffset) r.scrollToOffset({ offset: 0, animated: true })
        else r?.scrollTo?.({ y: 0, animated: true })
      })
    })
    return unsubscribe
  }, [navigation, ref])
}
