import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
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
 */
export function ResultsScoreCard({ pct, correct, total }: ResultsScoreCardProps) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])
  const band = scoreBand(pct)

  return (
    <View style={s.card}>
      <Text style={s.pct}>{pct}%</Text>
      <Text style={s.sub}>{correct}/{total} correct</Text>
      <Text style={s.band}>{band.band}</Text>
      <Text style={s.blurb}>{band.blurb}</Text>
    </View>
  )
}

function makeStyles(
  t: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['theme'],
  typo: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['typo'],
) {
  return StyleSheet.create({
    // Always the same neutral surface — no success/danger tint keyed off score.
    card: {
      backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border,
      borderRadius: 24, borderCurve: 'continuous', padding: 22, marginBottom: 18, alignItems: 'center',
    },
    pct: { fontSize: 52, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    sub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    band: { fontSize: typo.lg, fontWeight: '700', color: t.accentText, fontFamily: 'Outfit_700Bold', marginTop: spacing.sm },
    blurb: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginTop: 2, textAlign: 'center' },
  })
}
