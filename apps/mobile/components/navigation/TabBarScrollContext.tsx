import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import type { NativeScrollEvent, NativeSyntheticEvent, View } from 'react-native'
import { NavigationContext } from '@react-navigation/native'
import { runOnJS, useAnimatedScrollHandler, useSharedValue, type SharedValue } from 'react-native-reanimated'

// ---------------------------------------------------------------------------
// The floating tab bar's link to the screens under it:
// - minimized: the capsule's collapsed state, decided on the UI thread from
//   the focused screen's scroll and mirrored to React only when it flips;
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

export interface ScrollSample {
  y: number
  dy: number
  /** Content height and viewport height, to spot the bottom overscroll bounce. */
  contentHeight: number
  viewportHeight: number
  /** Only the focused screen may move the bar (a stale event from a tab
   *  scrolled away from must not leave it minimized). */
  focused: boolean
}

/**
 * The bar's next state for a sample, or `prev` when the sample must not move
 * it: an unfocused screen, or the rubber-band back from overscrolling the
 * bottom (that negative delta is not the student scrolling up).
 */
export function scrollFlip(prev: boolean, s: ScrollSample): boolean {
  'worklet'
  if (!s.focused) return prev
  const maxY = Math.max(0, s.contentHeight - s.viewportHeight)
  if (s.dy < 0 && s.y > maxY) return prev
  return nextMinimized(prev, s.y, s.dy)
}

interface TabBarScrollValue {
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
  const minimizedSV = useSharedValue(false)
  const [minimized, setMinimizedState] = useState(false)
  // Blur targets live in state, so a scene registering after the bar's first
  // render re-renders the bar with the new ref (Android blur, Search).
  const [targets, setTargets] = useState<ReadonlyMap<string, RefObject<View | null>>>(() => new Map())

  // Stable for the provider's lifetime: consumers key effects on it.
  const minimizedRef = useRef(minimizedSV)
  useEffect(() => { minimizedRef.current = minimizedSV }, [minimizedSV])
  const setMinimized = useCallback((v: boolean) => {
    minimizedRef.current.value = v
    setMinimizedState(v)
  }, [])

  const registerBlurTarget = useCallback((routeKey: string, ref: RefObject<View | null> | null) => {
    setTargets(prev => {
      if ((prev.get(routeKey) ?? null) === ref) return prev
      const next = new Map(prev)
      if (ref) next.set(routeKey, ref)
      else next.delete(routeKey)
      return next
    })
  }, [])

  const blurTargetFor = useCallback((routeKey: string | undefined) => (
    routeKey ? targets.get(routeKey) : undefined
  ), [targets])

  const value = useMemo<TabBarScrollValue>(() => ({
    minimizedSV, minimized, setMinimized, barHostsSearch, registerBlurTarget, blurTargetFor,
  }), [minimizedSV, minimized, setMinimized, barHostsSearch, registerBlurTarget, blurTargetFor])

  return <TabBarScrollContext.Provider value={value}>{children}</TabBarScrollContext.Provider>
}

/** The bar's scroll state, or null outside the tab navigator. */
export function useTabBarScroll(): TabBarScrollValue | null {
  return useContext(TabBarScrollContext)
}

/** Whether this screen is the focused one (true outside a navigator). */
function useFocusedValue(): SharedValue<boolean> {
  const navigation = useContext(NavigationContext)
  const focused = useSharedValue(navigation ? navigation.isFocused() : true)
  useEffect(() => {
    if (!navigation) return
    focused.value = navigation.isFocused()
    const offFocus = navigation.addListener('focus', () => { focused.value = true })
    const offBlur = navigation.addListener('blur', () => { focused.value = false })
    return () => { offFocus(); offBlur() }
  }, [navigation, focused])
  return focused
}

export interface TabBarScrollOptions {
  /** The screen's own offset (its large-title band). */
  localY?: SharedValue<number>
  /** A caller's JS onScroll, still called (on the JS thread). */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void
}

/**
 * The scroll handler a tab screen's Animated scroll view (ScrollView or
 * FlatList) passes as `onScroll` (with scrollEventThrottle 16). It writes the
 * offset to `localY` and flips the bar's minimized state while this screen
 * is focused. Runs on the UI thread.
 */
export function useTabBarScrollHandler(opts: TabBarScrollOptions = {}) {
  const ctx = useContext(TabBarScrollContext)
  const fallbackY = useSharedValue(0)
  const fallbackMin = useSharedValue(false)
  const lastY = useSharedValue(0)
  const focused = useFocusedValue()
  const minimizedSV = ctx?.minimizedSV ?? fallbackMin
  const setMinimized = ctx?.setMinimized
  const ownY = opts.localY ?? fallbackY
  const jsOnScroll = opts.onScroll

  return useAnimatedScrollHandler({
    onScroll: (e) => {
      const y = e.contentOffset.y
      const dy = y - lastY.value
      lastY.value = y
      ownY.value = y
      if (jsOnScroll) runOnJS(jsOnScroll)({ nativeEvent: e } as unknown as NativeSyntheticEvent<NativeScrollEvent>)
      if (!setMinimized) return
      const next = scrollFlip(minimizedSV.value, {
        y, dy,
        contentHeight: e.contentSize.height,
        viewportHeight: e.layoutMeasurement.height,
        focused: focused.value,
      })
      if (next !== minimizedSV.value) {
        minimizedSV.value = next
        runOnJS(setMinimized)(next)
      }
    },
  }, [setMinimized, jsOnScroll])
}

interface ScrollableRef {
  scrollTo?: (opts: { x?: number; y?: number; animated?: boolean }) => void
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void
}

/** Anything holding a scroll view in `.current` (a RefObject or an AnimatedRef). */
export interface HasCurrent { readonly current: unknown }

/**
 * Re-pressing the tab you are on scrolls it to the top (the bar emits
 * `tabPress` and does not navigate). Like React Navigation's useScrollToTop,
 * but a no-op outside a navigator (tests, previews) and only for a screen
 * that is itself a tab, or the root of a stack that is one (Search sits in
 * its own stack so iOS can give it the native search field).
 */
export function useScrollToTopOnReselect(ref: HasCurrent) {
  const navigation = useContext(NavigationContext)
  useEffect(() => {
    if (!navigation) return
    const stateOf = (n: { getState?: () => unknown } | undefined) =>
      n?.getState?.() as { type?: string; index?: number } | undefined
    const own = stateOf(navigation)
    const parent = navigation.getParent?.()
    const inTabStack = own?.type === 'stack' && stateOf(parent)?.type === 'tab'
    if (own?.type !== 'tab' && !inTabStack) return
    const tab = (inTabStack ? parent : navigation) as typeof navigation
    const unsubscribe = (tab.addListener as unknown as (
      e: 'tabPress', cb: (ev: { defaultPrevented?: boolean }) => void,
    ) => () => void)('tabPress', (ev) => {
      if (!navigation.isFocused() || ev.defaultPrevented) return
      // A screen pushed on the tab's stack is left to the stack (it pops).
      if (inTabStack && (stateOf(navigation)?.index ?? 0) !== 0) return
      requestAnimationFrame(() => {
        const r = ref.current as ScrollableRef | null
        if (r?.scrollToOffset) r.scrollToOffset({ offset: 0, animated: true })
        else r?.scrollTo?.({ y: 0, animated: true })
      })
    })
    return unsubscribe
  }, [navigation, ref])
}
