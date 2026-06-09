import { Pressable, View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

interface Props {
  title: string
  subtitle?: string
  /** Large icon/emoji faded in the top-right corner. */
  icon?: React.ReactNode
  onPress?: () => void
  /** Tint background (e.g. category color). Defaults to themed surface. */
  backgroundColor?: string
}

/**
 * Dashboard grid module (design system §3): ~square heavy-radius card with text at
 * the bottom-left and a large faded icon in the top-right. Lay out 2-up by the caller
 * (e.g. flexDirection row + flexWrap, each GridCard width '48%').
 */
export function GridCard({ title, subtitle, icon, onPress, backgroundColor }: Props) {
  const { theme: t, typo } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        {
          minHeight: 116,
          justifyContent: 'flex-end',
          backgroundColor: backgroundColor ?? t.surface,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.xl,
          borderCurve: 'continuous',
          boxShadow: t.shadowSm,
          padding: spacing.lg,
          overflow: 'hidden',
        },
        pressed ? { opacity: 0.85 } : null,
      ]}
    >
      {icon ? (
        <View style={{ position: 'absolute', top: spacing.sm, right: spacing.sm, opacity: 0.22 }}>{icon}</View>
      ) : null}
      <Text style={{ fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' }} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 2 }} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  )
}
