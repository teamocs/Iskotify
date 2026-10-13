import { useTheme } from '../../theme/ThemeContext'
import { InsetGroup, InsetRow } from '../ui/InsetGroup'
import { ProgressBar } from '../ui/ProgressBar'
import { Text } from '../ui/Text'
import { nextFocusSubtest, type SubtestRow } from '../../utils/subtestBreakdown'

export const FOCUS_HINT = 'Focus here next'

/**
 * "By skill" (iOS redesign P4): one inset-group row per subtest / section
 * with a thin 4pt bar and the raw count beside the tabular percent. Every bar
 * uses the same neutral accent tone whatever the score (no red/green
 * verdicts); the weakest one carries the calm hint "Focus here next".
 */
export function ResultsBreakdown({ rows, inset = false }: { rows: SubtestRow[]; inset?: boolean }) {
  const { theme: t } = useTheme()
  const focus = nextFocusSubtest(rows)
  if (rows.length === 0) return null
  return (
    <InsetGroup header="By skill" inset={inset} testID="results-by-skill">
      {rows.map(r => {
        const focused = r.name === focus
        const count = `${r.correct} of ${r.total} correct`
        return (
          <InsetRow
            key={r.name}
            title={r.name}
            subtitle={focused ? `${count} · ${FOCUS_HINT}` : count}
            accessibilityLabel={`${r.name}, ${count}, ${r.pct}%${focused ? `, ${FOCUS_HINT}` : ''}`}
            trailing={(
              <Text role="headline" color={t.textSecondary} style={{ fontVariant: ['tabular-nums'] }} maxFontSizeMultiplier={1.6}>
                {r.pct}%
              </Text>
            )}
            below={<ProgressBar value={r.pct / 100} label={`${r.name} score`} height={4} />}
          />
        )
      })}
    </InsetGroup>
  )
}
