import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'

interface Props {
  value: string | number
  label: string
  unit?: string
  size?: 'md' | 'lg'
  align?: 'left' | 'center'
}

/**
 * A number that matters (countdown, score, timer) in tabular figures so it
 * doesn't jitter as digits change. Read as one phrase: "Until UPCAT: 12 days".
 */
export function StatNumber({ value, label, unit, size = 'md', align = 'left' }: Props) {
  const { theme: t } = useTheme()
  const spoken = `${label}: ${value}${unit ? ` ${unit}` : ''}`
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={{ alignItems: align === 'center' ? 'center' : 'flex-start', gap: 2 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
        {/* Deliberate 1.5 cap: these figures are already 22–36pt; at 2× a
            countdown or score wraps mid-number and breaks tabular alignment.
            The unit and label beside it scale to 2× like all other text. */}
        <Text style={textStyle(size === 'lg' ? 'numericLg' : 'numeric', t.textPrimary)} maxFontSizeMultiplier={1.5}>
          {value}
        </Text>
        {unit ? <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{unit}</Text> : null}
      </View>
      <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>{label}</Text>
    </View>
  )
}
