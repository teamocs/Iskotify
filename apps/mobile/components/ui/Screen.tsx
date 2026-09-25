import { Platform, ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaView, type Edge } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { layout, spacing } from '../../theme/tokens'
import { useBreakpoint, pagePadding, contentMaxWidth } from '../../hooks/useBreakpoint'
import { useSafeInsets } from '../../hooks/useSafeInsets'

interface Props {
  children: React.ReactNode
  /** Fixed header above the scrolling body (e.g. <TabHeader>). Shares the content width. */
  header?: React.ReactNode
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

/**
 * The page primitive: safe area, themed ground, responsive gutter, and a
 * content column capped at a readable width and centered on tablets and
 * desktop web — so a wide window gets a composed page, not a stretched phone.
 */
export function Screen({
  children, header, width = 'reading', scroll = true, tabBarInset = false, padded = true,
  edges = ['top'], refreshControl, contentContainerStyle, testID,
}: Props) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const insets = useSafeInsets()
  const gutter = padded ? pagePadding(bp) : 0
  // Desktop web swaps the bottom bar for the sidebar, so no clearance there.
  const hasBottomBar = tabBarInset && !(Platform.OS === 'web' && bp === 'expanded')
  const paddingBottom = insets.bottom + (hasBottomBar ? layout.tabBarClearance : spacing.xl)

  const column: ViewStyle = {
    width: '100%',
    maxWidth: bp === 'compact' ? undefined : contentMaxWidth(width),
    alignSelf: 'center',
    paddingHorizontal: gutter,
  }

  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.bg }} testID={testID}>
      {Platform.OS === 'web' ? <View style={{ height: spacing.md }} /> : null}
      {header ? <View style={column}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          testID="screen-scroll"
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          refreshControl={refreshControl}
          contentContainerStyle={{ paddingBottom }}
        >
          <View testID="screen-content" style={[column, contentContainerStyle]}>{children}</View>
        </ScrollView>
      ) : (
        <View testID="screen-content" style={[column, { flex: 1 }, contentContainerStyle]}>{children}</View>
      )}
    </SafeAreaView>
  )
}
