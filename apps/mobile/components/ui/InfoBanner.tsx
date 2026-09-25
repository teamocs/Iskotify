import { View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

interface Props {
  /** Leading icon element (a Lineicons node). Decorative: the message carries the meaning. */
  icon?: React.ReactNode
  message: string
  /** Optional trailing action (text button). */
  actionLabel?: string
  onAction?: () => void
  tone?: 'accent' | 'neutral'
}

/** Full-width rounded informational banner (design system §4). */
export function InfoBanner({ icon, message, actionLabel, onAction, tone = 'accent' }: Props) {
  const { theme: t } = useTheme()
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
        paddingLeft: spacing.lg,
        paddingRight: actionLabel && onAction ? spacing.xs : spacing.lg,
        paddingVertical: spacing.xs,
        minHeight: 52,
      }}
    >
      {icon ? (
        <View
          testID="info-banner-icon"
          {...decorative}
          style={{ width: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          {icon}
        </View>
      ) : null}
      <Text
        style={[textStyle('bodySm', t.textSecondary), { flex: 1, paddingVertical: spacing.sm }]}
        maxFontSizeMultiplier={2}
      >
        {message}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          style={(state) => {
            const { pressed, hovered, focused } = state as WebPressableState
            return [
              {
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: spacing.md,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderCurve: 'continuous',
                backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
              },
              focusRing(t.focusRing, focused),
            ]
          }}
        >
          <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={2}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}
