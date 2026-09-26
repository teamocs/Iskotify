import { Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { decorative } from '../ui/a11y'
import { TOUR_LENGTH, tourPositionLabel } from './tourFlow'

interface Props {
  index: number
  onBack: () => void
  onNext: () => void
  /** Label of the primary action (Next, or the last card's send-off). */
  nextLabel: string
}

/**
 * Progress dots with the "n of N" position (a polite live region, so a screen
 * reader hears where it is after each step), then Back and the one primary.
 */
export function TourControls({ index, onBack, onNext, nextLabel }: Props) {
  const { theme: t } = useTheme()
  const first = index === 0
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <View {...decorative} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {Array.from({ length: TOUR_LENGTH }, (_, i) => (
            <View
              key={i}
              style={{
                height: 8, width: i === index ? 24 : 8, borderRadius: radius.pill,
                backgroundColor: i === index ? t.accentText : i < index ? t.accentBorder : t.inputBorder,
                opacity: i === index ? 1 : 0.7,
              }}
            />
          ))}
        </View>
        <Text
          accessibilityLiveRegion="polite"
          aria-live="polite"
          style={textStyle('label', t.textSecondary)}
          maxFontSizeMultiplier={1.6}
        >
          {tourPositionLabel(index)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button
          label="Back"
          variant="secondary"
          size="lg"
          onPress={onBack}
          disabled={first}
          style={{ flexGrow: 0, opacity: first ? 0.5 : 1 }}
        />
        <View style={{ flex: 1 }}>
          <Button label={nextLabel} size="lg" onPress={onNext} fullWidth />
        </View>
      </View>
    </View>
  )
}
