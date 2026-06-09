import { Pressable, Text, ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

type Variant = 'primary' | 'secondary' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  /** Span the full width of the container (e.g. sticky footers). Otherwise wraps content. */
  fullWidth?: boolean
  disabled?: boolean
  loading?: boolean
  /** Optional leading glyph/emoji or icon element. */
  leading?: React.ReactNode
  accessibilityLabel?: string
  style?: StyleProp<ViewStyle>
}

/**
 * Fully pill-shaped action button (design system §4). `primary` = filled accent,
 * `secondary` = outline (same pill), `ghost` = text-only. ≥48pt touch target.
 */
export function PillButton({
  label, onPress, variant = 'primary', fullWidth, disabled, loading, leading, accessibilityLabel, style,
}: Props) {
  const { theme: t, typo } = useTheme()
  const isPrimary = variant === 'primary'
  const isGhost = variant === 'ghost'
  const inactive = !!(disabled || loading)
  const bg = isPrimary ? t.accent : isGhost ? 'transparent' : t.surface
  const fg = isPrimary ? '#ffffff' : t.accentText

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: 52,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.xxl,
          borderRadius: radius.pill,
          backgroundColor: bg,
          borderWidth: isPrimary ? 0 : 1,
          borderColor: isGhost ? 'transparent' : t.border,
          opacity: inactive ? 0.5 : 1,
        },
        pressed && !inactive ? { opacity: 0.85 } : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : (leading ? <View>{leading}</View> : null)}
      <Text style={{ fontSize: typo.base, fontFamily: 'Outfit_700Bold', color: fg, letterSpacing: 0.2 }}>{label}</Text>
    </Pressable>
  )
}
