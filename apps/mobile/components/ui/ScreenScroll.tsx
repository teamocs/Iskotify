import { ScrollView, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'

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
  const paddingBottom = insets.bottom + (tabBarInset ? layout.tabBarClearance : spacing.xl)

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
      {children}
    </ScrollView>
  )
}
