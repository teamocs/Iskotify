import { Platform, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { useScrollToTopOnReselect, useTabBarScrollHandler } from '../navigation/TabBarScrollContext'
import { usesSystemTabBar } from '../navigation/systemTabBar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'

// Content widths: medium (tablet) gets the 720 reading column; expanded
// (desktop, beside the sidebar) keeps 1040 for grid-heavy tab screens.
const MAX_WIDTH_LG = contentMaxWidth('wide')
const MAX_WIDTH_MD = contentMaxWidth('reading')

interface Props extends ScrollViewProps {
  children: React.ReactNode
  /** Reserve space for the floating bottom tab bar (true for tab screens). */
  tabBarInset?: boolean
  /** Apply the responsive horizontal page gutter (16 / 24 / 32 by size class). */
  padded?: boolean
  contentContainerStyle?: StyleProp<ViewStyle>
}

/**
 * Page scroll container: themed background, safe-area-aware bottom inset that
 * clears the floating tab capsule (no overlap), and consistent horizontal padding.
 *
 * On web (md/lg), content is centered at a max-width so every screen that uses
 * ScreenScroll gets comfortable reading widths for free.
 */
export function ScreenScroll({
  children,
  tabBarInset = true,
  padded = true,
  contentContainerStyle,
  onScroll: callerOnScroll,
  ...rest
}: Props) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const bp = useBreakpoint()

  // On desktop web (lg), tab bar is hidden (SidebarNav takes over) so we don't
  // add the tab bar clearance padding. On native/sm the floating bar is present.
  const isDesktopWeb = Platform.OS === 'web' && bp === 'expanded'
  // iOS: native tabs inset the tab's first scroll view for the system bar and
  // the home indicator, so a tab screen adds only the page gap.
  const paddingBottom = tabBarInset && usesSystemTabBar()
    ? spacing.xl
    : insets.bottom + (tabBarInset && !isDesktopWeb ? layout.capsuleClearance : spacing.xl)
  // Feeds the bar and still calls a caller's own onScroll.
  const onScroll = useTabBarScrollHandler({ onScroll: callerOnScroll ?? undefined })
  const scrollRef = useAnimatedRef<Animated.ScrollView>()
  useScrollToTopOnReselect(scrollRef)

  // Web-only: wrap children in a max-width centering view for md/lg viewports.
  // sm (and native) renders unchanged — no wrapper, no max-width.
  const isWeb = Platform.OS === 'web'
  const needsMaxWidth = isWeb && bp !== 'compact'
  const maxWidth = bp === 'expanded' ? MAX_WIDTH_LG : MAX_WIDTH_MD

  // The caller's contentContainerStyle (gap, paddingTop…) moves onto the
  // centered column when there is one — otherwise `gap` would space only the
  // single wrapper and every section would touch on tablets and desktop.
  const innerContent = needsMaxWidth ? (
    <View testID="screen-scroll-column" style={[{ width: '100%', maxWidth, alignSelf: 'center' }, contentContainerStyle]}>
      {children}
    </View>
  ) : children

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: t.bg }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      // Feeds the floating tab bar (minimize on scroll); a no-op off the tabs.
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[
        { paddingHorizontal: padded ? pagePadding(bp) : 0, paddingBottom },
        needsMaxWidth ? null : contentContainerStyle,
      ]}
      {...rest}
    >
      {innerContent}
    </Animated.ScrollView>
  )
}
