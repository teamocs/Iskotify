import { useEffect, useRef, useState } from 'react'
import { View, Text, Pressable, TextInput, Platform, type LayoutChangeEvent, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { KeyboardStickyView } from 'react-native-keyboard-controller'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined } from '@lineiconshq/free-icons'
// Type-only import for the custom tabBar prop; the app uses expo-router Tabs (JS navigator) by design.
// react-doctor-disable-next-line react-doctor/rn-no-non-native-navigator
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useTheme } from '../../theme/ThemeContext'
import { layout, motion, radius, spacing, weight, iosTextStyle } from '../../theme/tokens'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { selection } from '../../lib/haptics'
import { Glass } from '../ui/Glass'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { useSearchQuery, submitSearchQuery } from '../search/searchQuery'
import { useTabBarScroll } from './TabBarScrollContext'
import {
  SEARCH_DESTINATION, TAB_DESTINATIONS, destinationForRoute, type Destination, type TabName,
} from './destinations'

// ---------------------------------------------------------------------------
// The floating glass tab bar (Android, and web at compact / medium widths;
// iOS moves to NativeTabs in P2b). A capsule with the four destinations and a
// separate search circle, both on <Glass variant="bar">:
//
//   tabs       [ Today Practice Explore Progress ]  ( search )
//   minimized  ( active )                           ( search )   scrolled down
//   search     ( back to tab )  [ search field ...............]   on Search
//
// The capsule and the search control morph by width on spring.smooth; the
// selection lens slides on spring.bouncy. Reduce Motion: the lens jumps and
// the morphs become a 160ms crossfade.
// ---------------------------------------------------------------------------

const BAR = layout.tabCapsule.height          // 62
const CIRCLE = layout.searchCircle            // 62
const GAP = spacing.md                        // 12 between capsule and circle
const PAD = 4                                 // capsule inner padding
/** Web: the capsule never grows past this on tablets and wide phones. */
export const CAPSULE_MAX_WIDTH = 560
const LABEL_SCALE = 1.3

export type BarMode = 'tabs' | 'minimized' | 'search'

/** Which shape the bar takes. */
export function barMode(focused: TabName | null, minimized: boolean): BarMode {
  if (focused === 'search') return 'search'
  return minimized ? 'minimized' : 'tabs'
}

/** Target widths for the capsule and the search control in a row of `rowWidth`. */
/** Gap between the bar and the top of the open keyboard. */
export const KEYBOARD_GAP = spacing.sm

/**
 * KeyboardStickyView's `opened` offset. It translates the bar by
 * `-keyboardHeight + opened`, and react-native-keyboard-controller 1.20
 * reports the keyboard height from the bottom of the window: under SDK 55's
 * Android edge-to-edge (detected by KeyboardProvider through
 * react-native-is-edge-to-edge, which then forces statusBarTranslucent and
 * navigationBarTranslucent itself, so the provider needs no props) that
 * height includes the navigation-bar area the keyboard covers, as it does
 * on iOS with the home indicator. The bar rests `26 + insets.bottom` above
 * the window bottom, so cancelling that rest offset (less the gap) lands it
 * KEYBOARD_GAP above the keyboard whatever the nav-bar inset is.
 */
export function keyboardOpenedOffset(insetBottom: number): number {
  return layout.tabCapsule.bottom + insetBottom - KEYBOARD_GAP
}

export function barWidths(mode: BarMode, rowWidth: number): { capsule: number; search: number } {
  const full = Math.max(CIRCLE, rowWidth - CIRCLE - GAP)
  return {
    capsule: mode === 'tabs' ? full : CIRCLE,
    search: mode === 'search' ? full : CIRCLE,
  }
}

// Inside the clipped capsule an outward ring would be cut off: draw it inset.
function insetRing(color: string, focused: boolean | undefined): ViewStyle | null {
  const ring = focusRing(color, focused)
  return ring ? { ...ring, outlineOffset: -3 } as ViewStyle : null
}

const destByName = (name: TabName): Destination =>
  name === 'search' ? SEARCH_DESTINATION : (TAB_DESTINATIONS.find(d => d.name === name) ?? TAB_DESTINATIONS[0]!)

/**
 * The lens under tab `index` in a capsule `capsuleWidth` wide: the four tabs
 * share the width inside the padding equally (flex: 1), so the geometry is
 * arithmetic, worked out on the UI thread with no layout round-trip.
 */
export function lensFrame(index: number, capsuleWidth: number): { x: number; width: number } {
  'worklet'
  const width = Math.max(0, (capsuleWidth - PAD * 2) / TAB_DESTINATIONS.length)
  return { x: PAD + index * width, width }
}

function TabItem({ dest, isFocused, onPress }: {
  dest: Destination; isFocused: boolean; onPress: () => void
}) {
  const { theme: t } = useTheme()
  const color = isFocused ? t.accentText : t.textPrimary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      aria-selected={isFocused}
      accessibilityLabel={dest.label}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            flex: 1,
            // minHeight, not height: labels scale (to 1.3x) and the bar grows.
            minHeight: BAR - PAD * 2,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            paddingHorizontal: spacing.xs,
            borderRadius: radius.capsule,
            opacity: pressed ? 0.7 : 1,
          },
          insetRing(t.focusRing, focused),
        ]
      }}
    >
      <View {...decorative}>
        <Lineicons icon={dest.icon} size={22} color={color} />
      </View>
      <Text
        style={[iosTextStyle('caption', color), weight(isFocused ? '600' : '500')]}
        numberOfLines={1}
        maxFontSizeMultiplier={LABEL_SCALE}
      >
        {dest.label}
      </Text>
    </Pressable>
  )
}

/** A round 62pt control inside the bar (minimized pill, back, search). */
function RoundButton({ label, icon, color, onPress, testID, hint }: {
  label: string; icon: Destination['icon']; color: string; onPress: () => void; testID: string; hint?: string
}) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          { width: CIRCLE, minHeight: CIRCLE, alignItems: 'center', justifyContent: 'center', borderRadius: radius.capsule, opacity: pressed ? 0.7 : 1 },
          insetRing(t.focusRing, focused),
        ]
      }}
    >
      <View {...decorative}>
        <Lineicons icon={icon} size={24} color={color} />
      </View>
    </Pressable>
  )
}

/** The bar's bottom search field (Search focused), bound to the shared query. */
function BarSearchField() {
  const { theme: t } = useTheme()
  const [query, setQuery] = useSearchQuery()
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: CIRCLE, paddingLeft: spacing.lg, paddingRight: PAD }}>
      <View {...decorative}>
        <Lineicons icon={SEARCH_DESTINATION.icon} size={20} color={t.textSecondary} />
      </View>
      <TextInput
        testID="tab-bar-search-field"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submitSearchQuery}
        autoFocus
        placeholder="School, scholarship or exam"
        placeholderTextColor={t.textTertiary}
        accessibilityLabel="Search schools, scholarships and exams"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        maxFontSizeMultiplier={LABEL_SCALE}
        style={[
          iosTextStyle('body', t.textPrimary),
          { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      {query ? (
        <Pressable
          onPress={() => setQuery('')}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={(state) => {
            const { pressed, focused } = state as WebPressableState
            return [
              { width: 44, height: 44, borderRadius: radius.capsule, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 },
              insetRing(t.focusRing, focused),
            ]
          }}
        >
          <View {...decorative}>
            <Lineicons icon={XmarkOutlined} size={16} color={t.textSecondary} />
          </View>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * The bottom navigation on Android and on compact / medium web: the four
 * destinations in a glass capsule plus a search circle. Legacy routes are not
 * drawn; while one is focused, its owner tab is the selected one.
 */
export function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t } = useTheme()
  const insets = useSafeInsets()
  const { reduceMotion } = usePlatformCapabilities()
  const scroll = useTabBarScroll()
  const setMinimized = scroll?.setMinimized

  const focusedRoute = state.routes[state.index]
  const focusedDest = focusedRoute ? destinationForRoute(focusedRoute.name) : null
  const routeByName = new Map(state.routes.map(r => [r.name, r]))
  const mode = barMode(focusedDest, scroll?.minimized ?? false)

  // The tab Search returns to: the last of the four that was focused.
  const [prevTab, setPrevTab] = useState<TabName>('index')
  useEffect(() => {
    if (focusedDest && focusedDest !== 'search') setPrevTab(focusedDest)
  }, [focusedDest])

  // A new tab starts with the bar expanded.
  useEffect(() => { setMinimized?.(false) }, [focusedRoute?.key, setMinimized])

  const go = (name: TabName) => {
    const route = routeByName.get(name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    // Re-pressing the focused tab is the screen's cue to scroll to the top
    // (useScrollToTopOnReselect); it is not a change, so no haptic.
    if (focusedRoute?.key === route.key || event.defaultPrevented) return
    selection()
    navigation.navigate(route.name)
  }

  // ── Morph: capsule and search widths ────────────────────────────────────
  const [rowWidth, setRowWidth] = useState(0)
  const capsuleW = useSharedValue(0)
  const searchW = useSharedValue<number>(CIRCLE)
  const fade = useSharedValue(1)
  const shownMode = useRef<BarMode | null>(null)

  // The first measurement sets the widths before the frame that uses them.
  const onRowLayout = (e: LayoutChangeEvent) => {
    const width = Math.round(e.nativeEvent.layout.width)
    if (!rowWidth) {
      const w = barWidths(mode, width)
      capsuleW.value = w.capsule
      searchW.value = w.search
      shownMode.current = mode
    }
    setRowWidth(width)
  }

  useEffect(() => {
    if (!rowWidth) return
    const w = barWidths(mode, rowWidth)
    const modeChanged = shownMode.current !== null && shownMode.current !== mode
    shownMode.current = mode
    if (reduceMotion) {
      capsuleW.value = w.capsule
      searchW.value = w.search
      if (modeChanged) {
        fade.value = 0
        fade.value = withTiming(1, { duration: motion.duration.reduced })
      }
      return
    }
    capsuleW.value = withSpring(w.capsule, motion.spring.smooth)
    searchW.value = withSpring(w.search, motion.spring.smooth)
  }, [mode, rowWidth, reduceMotion, capsuleW, searchW, fade])

  // Until the row is measured the capsule just fills it (no animated width,
  // so no stale flex once the widths take over).
  const capsuleWidth = useAnimatedStyle(() => ({ width: capsuleW.value }))
  const searchWidth = useAnimatedStyle(() => ({ width: searchW.value }))
  const capsuleStyle = rowWidth ? capsuleWidth : { flex: 1 }
  const searchStyle = rowWidth ? searchWidth : { width: CIRCLE }
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  // ── Selection lens ───────────────────────────────────────────────────────
  // The tablist is laid out at the expanded capsule width (and clipped while
  // the capsule morphs), so the labels never squash; the lens is placed from
  // that width on the UI thread, springing a tab index rather than measuring.
  const fullCapsule = rowWidth ? barWidths('tabs', rowWidth).capsule : 0
  const tabsW = useSharedValue(0)
  const lensIndex = useSharedValue(0)
  const lensPlaced = useRef(false)
  const focusedIndex = TAB_DESTINATIONS.findIndex(d => d.name === focusedDest)

  useEffect(() => { tabsW.value = fullCapsule }, [fullCapsule, tabsW])

  useEffect(() => {
    if (focusedIndex < 0) return
    if (!lensPlaced.current || reduceMotion) {
      lensIndex.value = focusedIndex
      lensPlaced.current = true
      return
    }
    lensIndex.value = withSpring(focusedIndex, motion.spring.bouncy)
  }, [focusedIndex, reduceMotion, lensIndex])

  const lensStyle = useAnimatedStyle(() => {
    const f = lensFrame(lensIndex.value, tabsW.value)
    return { width: f.width, transform: [{ translateX: f.x }] }
  })

  const blurTarget = scroll?.blurTargetFor(focusedRoute?.key)
  const active = focusedDest && focusedDest !== 'search' ? destByName(focusedDest) : destByName(prevTab)
  const back = destByName(prevTab)
  const showLens = mode === 'tabs' && focusedDest !== null && focusedDest !== 'search'

  const capsuleContent = mode === 'tabs' ? (
    <View
      testID="tab-bar-tablist"
      accessibilityRole="tablist"
      style={[
        { flexDirection: 'row', alignItems: 'stretch', padding: PAD },
        fullCapsule ? { width: fullCapsule } : { flex: 1 },
      ]}
    >
      {showLens ? (
        <Animated.View
          testID="tab-bar-lens"
          {...decorative}
          pointerEvents="none"
          style={[
            { position: 'absolute', top: PAD, bottom: PAD, left: 0, borderRadius: radius.capsule, backgroundColor: t.accentSurface },
            lensStyle,
          ]}
        />
      ) : null}
      {TAB_DESTINATIONS.map(dest => {
        const route = routeByName.get(dest.name)
        if (!route) return null
        return (
          <TabItem
            key={route.key}
            dest={dest}
            isFocused={focusedDest === dest.name}
            onPress={() => go(dest.name)}
          />
        )
      })}
    </View>
  ) : mode === 'minimized' ? (
    <RoundButton
      testID="tab-bar-expand"
      label={`Show tab bar, ${active.label} selected`}
      icon={active.icon}
      color={t.accentText}
      onPress={() => setMinimized?.(false)}
    />
  ) : (
    <RoundButton
      testID="tab-bar-back"
      label={`Back to ${back.label}`}
      icon={back.icon}
      color={t.textPrimary}
      onPress={() => go(prevTab)}
    />
  )

  const searchContent = mode === 'search' ? (
    <BarSearchField />
  ) : (
    <RoundButton
      testID="tab-bar-search"
      label={SEARCH_DESTINATION.label}
      icon={SEARCH_DESTINATION.icon}
      color={t.textPrimary}
      onPress={() => go('search')}
    />
  )

  const bottom = layout.tabCapsule.bottom + insets.bottom
  const shell: ViewStyle = {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom,
    paddingHorizontal: layout.tabCapsule.inset,
    alignItems: 'center',
  }
  const row = (
    <View
      testID="tab-bar-row"
      onLayout={onRowLayout}
      style={{
        width: '100%',
        maxWidth: Platform.OS === 'web' ? CAPSULE_MAX_WIDTH + GAP + CIRCLE : undefined,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: GAP,
      }}
    >
      <Animated.View style={capsuleStyle}>
        <Glass testID="tab-bar-capsule" variant="bar" blurTarget={blurTarget} style={{ minHeight: BAR, flexDirection: 'row' }}>
          <Animated.View style={[{ flex: 1, flexDirection: 'row' }, fadeStyle]}>{capsuleContent}</Animated.View>
        </Glass>
      </Animated.View>
      <Animated.View style={searchStyle}>
        <Glass testID="tab-bar-search-glass" variant="bar" blurTarget={blurTarget} style={{ minHeight: BAR, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
          <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, fadeStyle]}>{searchContent}</Animated.View>
        </Glass>
      </Animated.View>
    </View>
  )

  // Native: the bar (and with it the search field) rides above the keyboard,
  // a small gap above it instead of its resting 26pt + safe area.
  if (Platform.OS === 'web') {
    return <View testID="floating-tab-bar" pointerEvents="box-none" style={shell}>{row}</View>
  }
  return (
    <KeyboardStickyView
      testID="floating-tab-bar"
      pointerEvents="box-none"
      style={shell}
      offset={{ closed: 0, opened: keyboardOpenedOffset(insets.bottom) }}
    >
      {row}
    </KeyboardStickyView>
  )
}
