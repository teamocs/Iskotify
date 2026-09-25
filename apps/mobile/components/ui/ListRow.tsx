import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from './a11y'

interface Props {
  title: string
  subtitle?: string
  /** Leading node (icon, Avatar, ProgressRing). Decorative for screen readers. */
  leading?: React.ReactNode
  /** Trailing node (Badge, StatNumber, value text). */
  trailing?: React.ReactNode
  onPress?: () => void
  /** Chevron shows by default on pressable rows that navigate. */
  showChevron?: boolean
  /** Defaults to "title, subtitle". */
  accessibilityLabel?: string
  accessibilityHint?: string
  disabled?: boolean
  testID?: string
}

/**
 * A flat list row (no card): leading → title/subtitle → trailing → chevron.
 * Use inside a Card or a plain list; group rows rather than stacking cards.
 */
export function ListRow({
  title, subtitle, leading, trailing, onPress, showChevron, accessibilityLabel, accessibilityHint, disabled, testID,
}: Props) {
  const { theme: t } = useTheme()
  const pressable = !!onPress
  const chevron = showChevron ?? pressable

  const content = (
    <>
      {leading ? (
        <View {...decorative} style={{ flexShrink: 0 }}>
          {leading}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={2} maxFontSizeMultiplier={2}>{title}</Text>
        {subtitle ? (
          <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={2} maxFontSizeMultiplier={2}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ? <View style={{ flexShrink: 0 }}>{trailing}</View> : null}
      {chevron ? (
        <View testID="list-row-chevron" style={{ transform: [{ scaleX: -1 }] }} {...decorative}>
          <Lineicons icon={ChevronLeftOutlined} size={16} color={t.textTertiary} />
        </View>
      ) : null}
    </>
  )

  const rowStyle = {
    minHeight: 56,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  }

  if (!pressable) {
    return <View style={rowStyle} testID={testID} accessibilityLabel={accessibilityLabel}>{content}</View>
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      accessibilityHint={accessibilityHint}
      aria-disabled={!!disabled}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        // Web hover (react-native-web reports `hovered`) is a lighter tint than
        // press, so pointer users see the row is live before they click.
        const fill = disabled ? null : pressed ? t.surface2 : hovered ? t.surfaceSubtle : null
        return [
          rowStyle,
          fill ? { backgroundColor: fill } : null,
          disabled ? { opacity: 0.5 } : null,
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      {content}
    </Pressable>
  )
}
