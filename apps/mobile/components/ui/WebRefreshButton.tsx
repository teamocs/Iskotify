import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { SyncOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

interface WebRefreshButtonProps {
  onRefresh: () => void | Promise<void>
  refreshing: boolean
  /**
   * Drop the visible label and draw a 44pt circle (the spoken name stays
   * "Refresh data"). For crowded phone headers where a labelled pill would
   * squeeze the page heading.
   */
  iconOnly?: boolean
}

/**
 * Web stand-in for pull-to-refresh (a desktop has no pull gesture). A drawn
 * sync icon plus a visible "Refresh" label, so the button reads as an action
 * rather than a stray glyph; the label says "Refreshing" while it runs.
 */
function WebRefreshButtonInner({ onRefresh, refreshing, iconOnly = false }: WebRefreshButtonProps) {
  const { theme: t } = useTheme()

  return (
    <Pressable
      onPress={() => { void onRefresh() }}
      disabled={refreshing}
      accessibilityRole="button"
      accessibilityLabel="Refresh data"
      aria-busy={refreshing}
      aria-disabled={refreshing}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            minHeight: 44,
            ...(iconOnly ? { width: 44, paddingHorizontal: 0 } : null),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            ...(iconOnly ? null : { paddingHorizontal: spacing.md }),
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: t.border,
            backgroundColor: pressed || hovered ? t.surface2 : t.surface,
            flexShrink: 0,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      {refreshing ? (
        <ActivityIndicator size="small" color={t.textSecondary} style={{ width: 18, height: 18 }} />
      ) : (
        <View testID="web-refresh-icon" {...decorative}>
          <Lineicons icon={SyncOutlined} size={18} color={t.textSecondary} />
        </View>
      )}
      {iconOnly ? null : (
        <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.6}>
          {refreshing ? 'Refreshing' : 'Refresh'}
        </Text>
      )}
    </Pressable>
  )
}

export function WebRefreshButton(props: WebRefreshButtonProps) {
  if (Platform.OS !== 'web') return null
  return <WebRefreshButtonInner {...props} />
}
