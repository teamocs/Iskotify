import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { Text } from '../ui/Text'
import type { WeeklyBar } from '../../hooks/useAnalytics'

/** The plot area's height; bars scale to the week's longest day. */
const PLOT = 96

function minutesPhrase(m: number): string {
  return m === 0 ? 'no practice' : `${m} minute${m === 1 ? '' : 's'}`
}

/** "Study time by day. Mon 12 minutes, Tue no practice, …" — the chart as one phrase. */
export function studyTimeChartLabel(data: WeeklyBar[]): string {
  return `Study time by day. ${data.map(d => `${d.dayLabel} ${minutesPhrase(d.minutes)}`).join(', ')}`
}

/**
 * Study time: seven daily bars of minutes practised, today last. Today is the
 * maroon accent; the other days are the same accent at 30%. Each day's minutes
 * are printed above its bar, and the whole figure is one labelled image for
 * screen readers.
 */
export function WeeklyChart({ data }: { data: WeeklyBar[] }) {
  const { theme: t } = useTheme()
  const max = Math.max(1, ...data.map(d => d.minutes))
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={studyTimeChartLabel(data)}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xs }}
    >
      {data.map((bar, i) => {
        const isToday = i === data.length - 1
        const h = bar.minutes > 0 ? Math.max(4, Math.round((bar.minutes / max) * PLOT)) : 0
        return (
          <View key={`${bar.dayLabel}-${i}`} style={{ flex: 1, alignItems: 'center', gap: spacing.xs }}>
            <Text
              role="caption"
              color={bar.minutes > 0 ? t.textPrimary : t.textSecondary}
              maxFontSizeMultiplier={1.4}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {bar.minutes > 0 ? `${bar.minutes}m` : '–'}
            </Text>
            <View style={{ width: '100%', maxWidth: 32, minHeight: PLOT, justifyContent: 'flex-end' }}>
              {h > 0 ? (
                <View
                  testID={isToday ? 'study-bar-today' : 'study-bar'}
                  style={{
                    height: h, width: '100%', backgroundColor: t.accent, opacity: isToday ? 1 : 0.3,
                    borderRadius: radius.chip, borderCurve: 'continuous',
                  }}
                />
              ) : null}
            </View>
            <Text
              role="caption"
              color={isToday ? t.accentText : t.textSecondary}
              maxFontSizeMultiplier={1.4}
              style={isToday ? { fontWeight: '600' } : null}
            >
              {bar.dayLabel}
            </Text>
          </View>
        )
      })}
    </View>
  )
}
