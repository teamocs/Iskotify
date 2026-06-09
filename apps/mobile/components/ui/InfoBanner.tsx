import { View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

interface Props {
  /** Leading glyph/emoji or icon element. */
  icon?: React.ReactNode
  message: string
  /** Optional trailing action (text button). */
  actionLabel?: string
  onAction?: () => void
  tone?: 'accent' | 'neutral'
}

/** Full-width rounded informational banner (design system §4). */
export function InfoBanner({ icon, message, actionLabel, onAction, tone = 'accent' }: Props) {
  const { theme: t, typo } = useTheme()
  const bg = tone === 'accent' ? t.accentSurface : t.surface2
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        backgroundColor: bg,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.lg,
        borderCurve: 'continuous',
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
      }}
    >
      {icon ? <View>{icon}</View> : null}
      <Text style={{ flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 }}>
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button" style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}>
          <Text style={{ fontSize: typo.sm, fontWeight: '700', color: t.accentText, fontFamily: 'Lexend_600SemiBold' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
