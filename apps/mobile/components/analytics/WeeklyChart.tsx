import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import type { WeeklyBar } from '../../hooks/useAnalytics'

const BAR_HEIGHT = 96

/** "Accuracy by day. Mon 80%, Tue no practice, …" — the chart as one phrase. */
export function weeklyChartLabel(data: WeeklyBar[]): string {
  return `Accuracy by day. ${data.map(d => `${d.dayLabel} ${d.accuracy !== null ? `${d.accuracy}%` : 'no practice'}`).join(', ')}`
}

/**
 * Seven daily accuracy bars, today last. Bars use accentBorder (≥3:1 non-text
 * contrast in both themes) and today uses accentText, so the bars stand on
 * their own; the numbers are printed too, and the whole chart is read as one
 * labelled image by screen readers.
 */
export function WeeklyChart({ data }: { data: WeeklyBar[] }) {
  const { theme: t } = useTheme()
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={weeklyChartLabel(data)}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}
    >
      {data.map((bar, i) => {
        const isToday = i === data.length - 1
        const h = bar.accuracy !== null ? Math.max(4, Math.round((bar.accuracy / 100) * BAR_HEIGHT)) : 0
        return (
          <View key={`${bar.dayLabel}-${i}`} style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
            <Text style={textStyle('caption', bar.accuracy !== null ? t.textPrimary : t.textSecondary)} maxFontSizeMultiplier={1.4}>
              {bar.accuracy !== null ? `${bar.accuracy}%` : '–'}
            </Text>
            <View
              style={{
                width: '100%', maxWidth: 40, height: BAR_HEIGHT, justifyContent: 'flex-end',
                backgroundColor: t.surfaceSubtle, borderRadius: radius.sm, overflow: 'hidden',
              }}
            >
              {h > 0 ? (
                <View style={{ height: h, backgroundColor: isToday ? t.accentText : t.accentBorder, borderRadius: radius.sm }} />
              ) : null}
            </View>
            <Text
              style={textStyle(isToday ? 'label' : 'caption', isToday ? t.accentText : t.textSecondary)}
              maxFontSizeMultiplier={1.4}
            >
              {bar.dayLabel}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
