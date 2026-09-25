import { Pressable, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

interface Props extends ViewProps {
  children: React.ReactNode
  /**
   * Lift the card with a soft shadow instead of an outline. Elevation is
   * declared once: an elevated card has no border (no "ghost card").
   */
  elevated?: boolean
  /** Apply default inner padding (spacing.lg). */
  padded?: boolean
  /** Makes the whole card one button. Give it an accessibilityLabel. */
  onPress?: () => void
  accessibilityLabel?: string
  accessibilityHint?: string
  style?: StyleProp<ViewStyle>
}

/** Consistent surface card: token radius/border/elevation, continuous corners. */
export function Card({
  children, elevated = false, padded = true, style, onPress, accessibilityLabel, accessibilityHint, ...rest
}: Props) {
  const { theme: t } = useTheme()
  const base: ViewStyle = {
    backgroundColor: t.surface,
    borderWidth: elevated ? 0 : 1,
    borderColor: t.border,
    borderRadius: radius.xl,
    borderCurve: 'continuous',
    padding: padded ? spacing.lg : 0,
    ...(elevated ? { boxShadow: t.shadowSm } : null),
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [base, pressed ? { backgroundColor: t.surface2 } : null, style]}
        {...rest}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View style={[base, style]} accessibilityLabel={accessibilityLabel} {...rest}>
      {children}
    </View>
  )
}
