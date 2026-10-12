import { Platform, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedRef, useSharedValue } from 'react-native-reanimated'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { useScrollToTopOnReselect, useTabBarScrollHandler } from '../navigation/TabBarScrollContext'
import { LargeTitleBandHost } from '../navigation/LargeTitleHeader'

interface Props {
  children: React.ReactNode
  /** Header above the body (e.g. <TabHeader>). Shares the content width. Fixed
   *  unless `headerScrolls`. */
  header?: React.ReactNode
  /** Scroll the header with the content (an iOS large title): it then
   *  collapses into the inline title band. Needs `scroll`. */
  headerScrolls?: boolean
  /** `reading` (720, default) for single-column task/prose screens; `wide` (1040) for two-column. */
  width?: 'reading' | 'wide'
  /** Scroll the body (default). Set false when the body owns a FlatList. */
  scroll?: boolean
  /** Reserve room for the floating bottom tab bar (tab screens on phone/tablet). */
  tabBarInset?: boolean
  /** Horizontal gutter (16 / 24 / 32 by size class). */
  padded?: boolean
  edges?: Edge[]
  refreshControl?: ScrollViewProps['refreshControl']
  contentContainerStyle?: StyleProp<ViewStyle>
  testID?: string
}

/** Bottom padding that keeps the last row clear of the floating capsule. */
export function bottomClearance(insetBottom: number, hasBottomBar: boolean): number {
  return insetBottom + (hasBottomBar ? layout.capsuleClearance : spacing.xl)
}

/**
 * The page primitive: safe area, themed ground, responsive gutter, and a
 * content column capped at a readable width and centered on tablets and
 * desktop web — so a wide window gets a composed page, not a stretched phone.
 *
 * The scroll view feeds the floating tab bar (minimize on scroll), scrolls to
 * the top when its tab is re-pressed, and hosts the collapsed large-title
 * band (components/navigation/LargeTitleHeader).
 */
export function Screen({
  children, header, headerScrolls = false, width = 'reading', scroll = true, tabBarInset = false, padded = true,
  edges = ['top'], refreshControl, contentContainerStyle, testID,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const insets = useSafeInsets()
  const scrollY = useSharedValue(0)
  const onScroll = useTabBarScrollHandler({ localY: scrollY })
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  useScrollToTopOnReselect(scrollRef)

  const gutter = padded ? pagePadding(bp) : 0
  // Desktop web swaps the bottom bar for the sidebar, so no clearance there.
  const hasBottomBar = tabBarInset && !(Platform.OS === 'web' && bp === 'expanded')
  const paddingBottom = bottomClearance(insets.bottom, hasBottomBar)
  const inScroll = scroll && headerScrolls

  const column: ViewStyle = {
    width: '100%',
    maxWidth: bp === 'compact' ? undefined : contentMaxWidth(width),
    alignSelf: 'center',
    paddingHorizontal: gutter,
  }

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }} testID={testID}>
      <LargeTitleBandHost
        scrollY={scrollY}
        topInset={edges.includes('top') ? insets.top : 0}
        contentTop={Platform.OS === 'web' ? spacing.md : 0}
      >
        {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
        {header && !inScroll ? <View style={column}>{header}</View> : null}
        {scroll ? (
          <Animated.ScrollView
            ref={scrollRef}
            testID="screen-scroll"
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            refreshControl={refreshControl}
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom }}
          >
            {header && inScroll ? <View style={column}>{header}</View> : null}
            <View testID="screen-content" style={[column, contentContainerStyle]}>{children}</View>
          </Animated.ScrollView>
        ) : (
          <View testID="screen-content" style={[column, { flex: 1 }, contentContainerStyle]}>{children}</View>
        )}
      </LargeTitleBandHost>
    </SafeAreaView>
  )
}
