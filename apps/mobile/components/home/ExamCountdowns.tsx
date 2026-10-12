import { View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { focusRing } from '../ui/a11y'
import { examPaceLabel, type ExamPace } from '../../utils/examPace'
import type { Countdown } from '../../utils/todayNextStep'

export interface CountdownTile extends Countdown {
  /** Null: nothing to measure yet, so no status line. */
  pace: ExamPace | null
}

interface Props {
  tiles: CountdownTile[]
}

function dayUnit(days: number): string {
  return days === 1 ? 'day' : 'days'
}

/**
 * The exam countdowns: a 2-column grid of white 18pt tiles, one per focused
 * exam with a date. Each shows the exam, a big tabular day count and a calm
 * pace line: successStrong "On pace" or accent "N sessions to catch up".
 * Never "behind", never warning red. A tile opens its listing.
 */
export function ExamCountdowns({ tiles }: Props) {
  if (tiles.length === 0) return null
  const rows: CountdownTile[][] = []
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2))

  return (
    <View testID="exam-countdowns" style={{ gap: spacing.md }}>
      {rows.map(row => (
        <View key={row.map(r => r.slug).join('|')} style={{ flexDirection: 'row', gap: spacing.md }}>
          {row.map(tile => <Tile key={tile.slug} tile={tile} />)}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  )
}

function Tile({ tile }: { tile: CountdownTile }) {
  const { theme: t } = useTheme()
  const today = tile.days === 0
  const status = tile.pace ? examPaceLabel(tile.pace) : null
  const when = today ? 'today' : `${tile.days} ${dayUnit(tile.days)} to go`

  return (
    <PressableScale
      testID={`countdown-${tile.slug}`}
      onPress={() => router.push(`/listings/${tile.slug}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${tile.title}, ${when}${status ? `, ${status.toLowerCase()}` : ''}`}
      style={({ pressed, focused }) => [
        {
          flex: 1, minWidth: 0, minHeight: 120,
          backgroundColor: pressed ? t.surfaceSubtle : t.surface,
          borderRadius: radius.group, borderCurve: 'continuous',
          padding: spacing.lg, gap: spacing.xs,
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <Text role="footnote" numberOfLines={2} style={{ fontWeight: '600' }}>{tile.title}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs, flexWrap: 'wrap' }}>
        <Text role="numericLg" maxFontSizeMultiplier={1.4}>{today ? 'Today' : String(tile.days)}</Text>
        {today ? null : <Text role="subheadline" color={t.textSecondary}>{dayUnit(tile.days)}</Text>}
      </View>
      {status ? (
        <Text role="footnote" color={tile.pace?.kind === 'on_pace' ? t.successStrong : t.accentText} style={{ fontWeight: '600' }}>
          {status}
        </Text>
      ) : null}
    </PressableScale>
  )
}
