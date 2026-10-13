import { View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { Text } from '../ui/Text'

interface ResultsScoreCardProps {
  pct: number
  correct: number
  /** Questions that count (the ones the student reached). */
  total: number
  /** Answered but not correct. Shown in the Correct / Wrong / Skipped strip when given. */
  wrong?: number
  /** Reached but left blank. */
  skipped?: number
  /**
   * A calm, factual headline ("Up 9 points since last week"). Pass one only
   * when real data supports it; there is no default line.
   */
  headline?: string | null
}

const RING = 168
const STROKE = 12

/**
 * The results score (iOS redesign P4; Fix 3 exam safety). One neutral card
 * whatever the score: an accent ring (an image named "Score: 72%, 18 of 25
 * correct"), the percent in largeTitle tabular figures, "N of M", an optional
 * factual headline and a Correct / Wrong / Skipped strip. Never a verdict,
 * band, percentile or cut-off, and never a pass/fail colour.
 */
export function ResultsScoreCard({ pct, correct, total, wrong, skipped, headline }: ResultsScoreCardProps) {
  const { theme: t } = useTheme()
  const clamped = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0))
  const r = (RING - STROKE) / 2
  const circumference = 2 * Math.PI * r
  const strip = wrong !== undefined || skipped !== undefined
    ? [
        { label: 'Correct', value: correct },
        { label: 'Wrong', value: wrong ?? 0 },
        { label: 'Skipped', value: skipped ?? 0 },
      ]
    : null

  return (
    <View
      testID="results-score-card"
      style={{
        // Always the same neutral surface — no success/danger tint keyed off score.
        backgroundColor: t.surface,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.xl,
        alignItems: 'center',
        gap: spacing.md,
      }}
    >
      <View
        accessible
        accessibilityRole="image"
        role="img"
        accessibilityLabel={`Score: ${clamped}%, ${correct} of ${total} correct`}
        style={{ minWidth: RING, minHeight: RING, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={RING} height={RING} style={{ position: 'absolute' }}>
          <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={t.surface2} strokeWidth={STROKE} fill="none" />
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={t.accent}
            strokeWidth={STROKE}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            strokeLinecap="round"
            fill="none"
            rotation={-90}
            origin={`${RING / 2}, ${RING / 2}`}
          />
        </Svg>
        <Text role="largeTitle" style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.4}>{clamped}%</Text>
        <Text role="subheadline" color={t.textSecondary} style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.4}>
          {correct} of {total}
        </Text>
      </View>
      {headline ? (
        <Text role="headline" style={{ textAlign: 'center' }} maxFontSizeMultiplier={1.6}>{headline}</Text>
      ) : null}
      {strip ? (
        <View testID="results-strip" style={{ flexDirection: 'row', alignSelf: 'stretch', gap: spacing.sm }}>
          {strip.map(s => (
            <View
              key={s.label}
              accessible
              accessibilityLabel={`${s.label}: ${s.value}`}
              style={{
                flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 2,
                paddingVertical: spacing.sm, borderRadius: radius.button, borderCurve: 'continuous', backgroundColor: t.surface2,
              }}
            >
              <Text role="title3" style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.6}>{s.value}</Text>
              <Text role="footnote" color={t.textSecondary} style={weight('600')} maxFontSizeMultiplier={1.6}>{s.label}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}
