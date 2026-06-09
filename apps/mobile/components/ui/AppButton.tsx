import { Pressable, Text, ActivityIndicator } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

type Variant = 'primary' | 'secondary' | 'ghost'

interface Props {
  label: string
  onPress: () => void
  variant?: Variant
  disabled?: boolean
  loading?: boolean
  accessibilityLabel?: string
}

/** Consistent button: ≥48pt touch target, token radius, theme-aware variants. */
export function AppButton({ label, onPress, variant = 'primary', disabled, loading, accessibilityLabel }: Props) {
  const { theme: t, typo } = useTheme()
  const isPrimary = variant === 'primary'
  const isGhost = variant === 'ghost'
  const bg = isPrimary ? t.accent : isGhost ? 'transparent' : t.surface2
  const fg = isPrimary ? '#ffffff' : t.textPrimary
  const inactive = !!(disabled || loading)

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      style={({ pressed }) => [
        {
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.xl,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          backgroundColor: bg,
          borderWidth: isGhost ? 0 : 1,
          borderColor: isPrimary ? t.accent : t.border,
          opacity: inactive ? 0.5 : 1,
        },
        pressed && !inactive ? { opacity: 0.85 } : null,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : null}
      <Text style={{ fontSize: typo.base, fontFamily: 'Outfit_700Bold', color: fg }}>{label}</Text>
    </Pressable>
  )
}
