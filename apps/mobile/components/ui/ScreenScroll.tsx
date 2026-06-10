import { Platform, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'

// Max-width constants for content centering on wide web viewports.
const MAX_WIDTH_LG = 1040
const MAX_WIDTH_MD = 840

interface Props extends ScrollViewProps {
  children: React.ReactNode
  /** Reserve space for the floating bottom tab bar (true for tab screens). */
  tabBarInset?: boolean
  /** Apply default horizontal page padding (spacing.lg). */
  padded?: boolean
  contentContainerStyle?: StyleProp<ViewStyle>
}

/**
 * Page scroll container: themed background, safe-area-aware bottom inset that
 * clears the flat tab bar (no overlap), and consistent horizontal padding.
 *
 * On web (md/lg), content is centered at a max-width so every screen that uses
 * ScreenScroll gets comfortable reading widths for free.
 */
export function ScreenScroll({
  children,
  tabBarInset = true,
  padded = true,
  contentContainerStyle,
  ...rest
}: Props) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  const bp = useBreakpoint()

  // On desktop web (lg), tab bar is hidden (SidebarNav takes over) so we don't
  // add the tab bar clearance padding. On native/sm the floating bar is present.
  const isDesktopWeb = Platform.OS === 'web' && bp === 'lg'
  const paddingBottom = insets.bottom + (tabBarInset && !isDesktopWeb ? layout.tabBarClearance : spacing.xl)

  // Web-only: wrap children in a max-width centering view for md/lg viewports.
  // sm (and native) renders unchanged — no wrapper, no max-width.
  const isWeb = Platform.OS === 'web'
  const needsMaxWidth = isWeb && (bp === 'lg' || bp === 'md')
  const maxWidth = bp === 'lg' ? MAX_WIDTH_LG : MAX_WIDTH_MD

  const innerContent = needsMaxWidth ? (
    <View
      style={{
        width: '100%',
        maxWidth,
        alignSelf: 'center',
      }}
    >
      {children}
    </View>
  ) : children

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        { paddingHorizontal: padded ? spacing.lg : 0, paddingBottom },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {innerContent}
    </ScrollView>
  )
}
