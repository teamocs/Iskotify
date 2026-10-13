import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { View, Text, type LayoutChangeEvent } from 'react-native'
import Animated, {
  Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../theme/ThemeContext'
import { iosTextStyle, layout, motion, spacing, weight } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { Glass } from '../ui/Glass'

// ---------------------------------------------------------------------------
// iOS-style large title: a 34/41 bold title that scrolls with the content.
// Once it has scrolled out of view, a 17pt semibold inline title fades in on
// a glass band pinned to the top, over a 24pt soft edge (bg → transparent).
//
// The band lives in the screen's band host (components/ui/Screen), outside
// the scroll view, so it stays put while the content moves under it. The
// header registers its title and measured height with that host.
// ---------------------------------------------------------------------------

/** Height of the soft fade under the band. */
export const SOFT_EDGE = 24
/** The inline title fades in over this many points of scroll. */
const FADE_SPAN = 12

/** True once the large title has scrolled under the band. */
export function isTitleCollapsed(scrollY: number, collapseAt: number): boolean {
  'worklet'
  return collapseAt > 0 && scrollY >= collapseAt
}

interface BandInfo { title: string; collapseAt: number }

interface BandHostValue {
  scrollY: SharedValue<number>
  register: (info: BandInfo | null) => void
  contentTop: number
}

/**
 * Scroll offset at which a title whose bottom edge is `titleBottom` (in
 * scroll-content coordinates) has gone under the band. The scroll view
 * starts below the safe area (the SafeAreaView pads it), plus `contentTop`,
 * so only the band's own 44pt row counts, less that spacer.
 */
export function collapseOffset(titleBottom: number, contentTop = 0): number {
  return Math.max(1, titleBottom - (layout.rowMinHeight - contentTop))
}

const BandHostContext = createContext<BandHostValue | null>(null)

/**
 * Hosts the collapsed-title band for one screen: provide the screen's own
 * scrollY, render the content as children; the band draws after them.
 */
interface BandHostProps {
  scrollY: SharedValue<number>
  /** The top safe-area inset the host's SafeAreaView pads by. The band is
   *  absolute at the host's top edge, so it pads by the same amount: its
   *  glass runs under the status bar and its title sits below it. */
  topInset?: number
  /** Distance from the safe-area top to the scroll view's top (the web's
   *  12pt spacer), so collapseAt is measured in the scroll view's terms. */
  contentTop?: number
  children: ReactNode
}

/**
 * Hosts the collapsed-title band for one screen: provide the screen's own
 * scrollY, render the content as children; the band draws after them.
 */
export function LargeTitleBandHost({ scrollY, topInset = 0, contentTop = 0, children }: BandHostProps) {
  const [info, setInfo] = useState<BandInfo | null>(null)
  const register = useCallback((next: BandInfo | null) => {
    setInfo(prev => (prev?.title === next?.title && prev?.collapseAt === next?.collapseAt ? prev : next))
  }, [])
  const value = useMemo(() => ({ scrollY, register, contentTop }), [scrollY, register, contentTop])
  return (
    <BandHostContext.Provider value={value}>
      {children}
      {info ? <CollapsedTitleBand title={info.title} collapseAt={info.collapseAt} scrollY={scrollY} topInset={topInset} /> : null}
    </BandHostContext.Provider>
  )
}

/**
 * The host's scrollY, for a screen whose own scroll view (not Screen's)
 * carries the large title, e.g. Progress's AnalyticsDashboard.
 */
export function useBandScrollY(): SharedValue<number> | undefined {
  return useContext(BandHostContext)?.scrollY
}

/**
 * The pinned band: glass, the inline title, and the soft edge below it.
 *
 * Android draws this band in the opaque tier on purpose: it lives inside the
 * scene's BlurTargetView, and a Dimezis BlurView must sit outside the target
 * it blurs (a blur inside its own target would sample itself).
 */
export function CollapsedTitleBand({ title, collapseAt, scrollY, topInset = 0 }: BandInfo & { scrollY: SharedValue<number>; topInset?: number }) {
  const { theme: t } = useTheme()
  const { reduceMotion } = usePlatformCapabilities()
  // Starts expanded; the UI-thread reaction below flips it (no shared-value
  // read during render).
  const [collapsed, setCollapsed] = useState(false)
  const fade = useSharedValue(0)

  // Mirror the threshold to React only when it flips (accessibility needs it).
  useAnimatedReaction(
    () => isTitleCollapsed(scrollY.value, collapseAt),
    (now, prev) => { if (now !== prev) runOnJS(setCollapsed)(now) },
    [collapseAt],
  )

  // Reduce Motion: a 160ms crossfade on the threshold, not a scroll-linked fade.
  useEffect(() => {
    if (reduceMotion) fade.value = withTiming(collapsed ? 1 : 0, { duration: motion.duration.reduced })
  }, [collapsed, reduceMotion, fade])

  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? fade.value
      : interpolate(scrollY.value, [collapseAt - FADE_SPAN, collapseAt], [0, 1], Extrapolation.CLAMP),
  }), [reduceMotion, collapseAt])

  return (
    <Animated.View
      testID="large-title-band"
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, style]}
      // Hidden from assistive tech until the large title has scrolled away;
      // until then the large title is the screen's heading.
      accessibilityElementsHidden={!collapsed}
      importantForAccessibility={collapsed ? 'auto' : 'no-hide-descendants'}
      aria-hidden={!collapsed}
    >
      <Glass
        testID="large-title-glass"
        variant="header"
        style={{ minHeight: layout.rowMinHeight + topInset, paddingTop: topInset, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg }}
      >
        <Text
          testID="large-title-inline"
          // Once revealed it names the screen, like the large title did.
          accessibilityRole={collapsed ? 'header' : undefined}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={iosTextStyle('headline', t.textPrimary)}
        >
          {title}
        </Text>
      </Glass>
      <LinearGradient colors={[t.bg, `${t.bg}00`]} style={{ height: SOFT_EDGE }} pointerEvents="none" />
    </Animated.View>
  )
}

interface Props {
  /** The screen title: the large title and the collapsed inline title. */
  title: string
  subtitle?: string
  /** A short line above the title, e.g. "Schools, scholarships, exams". */
  eyebrow?: string
  /** Controls beside the title (refresh, avatar…). */
  actions?: ReactNode
  /** Replaces the large title text with a custom heading (Today's greeting);
   *  `title` still names the collapsed band. */
  children?: ReactNode
  /** False under a fixed top bar (DetailTopBar): the title stays a plain
   *  header and never collapses into a band that would cover the bar. */
  collapses?: boolean
  testID?: string
}

/**
 * The large-title header. Put it at the top of the screen's scroll content
 * (Screen with `headerScrolls`, or as the first child of a scrolling Screen).
 * Without a band host it is a plain header.
 */
export function LargeTitleHeader({ title, subtitle, eyebrow, actions, children, collapses = true, testID = 'large-title-header' }: Props) {
  const { theme: t } = useTheme()
  const host = useContext(BandHostContext)
  const register = collapses ? host?.register : undefined
  const contentTop = host?.contentTop ?? 0

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout
    register?.({ title, collapseAt: collapseOffset(y + height, contentTop) })
  }, [register, title, contentTop])

  useEffect(() => () => register?.(null), [register])

  return (
    <View testID={testID} onLayout={onLayout} style={children ? null : { paddingTop: spacing.md, paddingBottom: spacing.sm }}>
      {children ?? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {eyebrow ? (
              <Text
                testID="large-title-eyebrow"
                style={[iosTextStyle('footnote', t.textSecondary), weight('600')]}
                maxFontSizeMultiplier={1.4}
              >
                {eyebrow}
              </Text>
            ) : null}
            <Text
              accessibilityRole="header"
              aria-level={1}
              style={iosTextStyle('largeTitle', t.textPrimary)}
              maxFontSizeMultiplier={1.3}
            >
              {title}
            </Text>
            {subtitle ? (
              <Text style={[iosTextStyle('footnote', t.textSecondary), { marginTop: 2 }]} maxFontSizeMultiplier={1.4}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          {actions}
        </View>
      )}
    </View>
  )
}
