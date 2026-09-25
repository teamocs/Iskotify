import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { scoreBand } from '../../utils/examBuilder'

interface ResultsScoreCardProps {
  pct: number
  correct: number
  total: number
}

/**
 * Fix 3 (exam safety) — replaces the pass/fail-colored score card (green
 * "🎉 Great work" / red "📚 Keep practicing", `s.pass`/`s.fail`) shared by
 * every results screen. One neutral card style regardless of score: raw
 * percent, raw correct/total, and a descriptive (non-judgemental) band —
 * never a verdict, never a percentile.
 *
 * Redesign M2: the percent is the display-size tabular figure (direction C:
 * big numbers, everything else quieter), read as one phrase by screen readers.
 */
export function ResultsScoreCard({ pct, correct, total }: ResultsScoreCardProps) {
  const { theme: t } = useTheme()
  const band = scoreBand(pct)

  return (
    <View
      style={{
        // Always the same neutral surface — no success/danger tint keyed off score.
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: radius.xl,
        borderCurve: 'continuous',
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.xl,
        alignItems: 'center',
        gap: spacing.xs,
      }}
    >
      <View accessible accessibilityLabel={`Score: ${pct}%, ${correct} of ${total} correct`} style={{ alignItems: 'center' }}>
        <Text style={[textStyle('display', t.textPrimary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.4}>{pct}%</Text>
        <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={1.6}>{correct}/{total} correct</Text>
      </View>
      <Text style={[textStyle('headline', t.accentText), { marginTop: spacing.sm }]} maxFontSizeMultiplier={1.5}>{band.band}</Text>
      <Text style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center', maxWidth: 420 }]} maxFontSizeMultiplier={1.6}>
        {band.blurb}
      </Text>
    </View>
  )
}
