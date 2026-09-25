import { View, Text, Pressable } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'

interface Props {
  title: string
  /** Optional descriptive subheadline rendered below the title row. */
  subtitle?: string
  /** Optional trailing action (e.g. "See all", "+ Add"). */
  actionLabel?: string
  onAction?: () => void
}

/** Section title row (announced as a header) with an optional subtitle and trailing text action. */
export function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text accessibilityRole="header" style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]}>{title}</Text>
        {actionLabel && onAction ? (
          <Pressable
            onPress={onAction}
            hitSlop={12}
            accessibilityRole="button"
            style={({ pressed }) => [{ minHeight: 32, justifyContent: 'center' }, pressed ? { opacity: 0.6 } : null]}
          >
            <Text style={textStyle('label', t.accentText)}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
      {subtitle ? (
        <Text style={[textStyle('caption', t.textTertiary), { marginTop: 2 }]} maxFontSizeMultiplier={1.4}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  )
}
