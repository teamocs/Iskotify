import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { SectionHeader } from '../ui/SectionHeader'
import { ProgressBar } from '../ui/ProgressBar'
import { nextFocusSubtest, type SubtestRow } from '../../utils/subtestBreakdown'

/**
 * Per-subtest results. Every bar uses the same neutral accent tone whatever
 * the score (no red/green verdicts), the raw count sits beside the percent,
 * and the one suggestion is framed as the next step, not a judgement.
 */
export function ResultsBreakdown({ rows }: { rows: SubtestRow[] }) {
  const { theme: t } = useTheme()
  const focus = nextFocusSubtest(rows)
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Per-section" subtitle="Your raw score in each part of this mock" />
      <View
        style={{
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
          borderRadius: radius.lg, borderCurve: 'continuous', paddingHorizontal: spacing.lg,
        }}
      >
        {rows.map((r, i) => (
          <View
            key={r.name}
            style={{
              paddingVertical: spacing.md, gap: spacing.sm,
              borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.divider,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
              <Text style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={1.6}>{r.name}</Text>
              <Text style={[textStyle('bodySm', t.textSecondary), { fontVariant: ['tabular-nums'] }]} maxFontSizeMultiplier={1.6}>
                {r.correct}/{r.total} correct · {r.pct}%
              </Text>
            </View>
            <ProgressBar value={r.pct / 100} label={`${r.name} score`} />
          </View>
        ))}
      </View>
      {focus ? (
        <Text style={[textStyle('body', t.textSecondary), { marginTop: spacing.xs }]} maxFontSizeMultiplier={1.6}>
          {focus} is your next hakbang. It has the most room to grow.
        </Text>
      ) : null}
    </View>
  )
}
