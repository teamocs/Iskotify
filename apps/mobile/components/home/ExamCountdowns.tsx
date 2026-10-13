import { View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { focusRing } from '../ui/a11y'
import type { Countdown } from '../../utils/todayNextStep'

interface Props {
  tiles: Countdown[]
}

// Hoisted: building an Intl formatter is slow. Exam dates are date-only
// values at UTC midnight, so their calendar parts are read in UTC.
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' })
const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

/** The tile's date line, day before month: "Sat, 9 Aug". */
export function examTileDate(dateMs: number): string {
  const d = new Date(dateMs)
  return `${WEEKDAY.format(d)}, ${d.getUTCDate()} ${MONTH.format(d)}`
}

function dayUnit(days: number): string {
  return days === 1 ? 'day' : 'days'
}

/**
 * The exam countdowns: a 2-column grid of white 18pt tiles, one for EVERY
 * focused exam with an upcoming date (the grid wraps; none is hidden). Each
 * shows the exam, a big tabular day count and a calm footnote date. No pace
 * line: there is no real pace data yet (owner, 2026-10-13). A tile opens its
 * listing.
 */
export function ExamCountdowns({ tiles }: Props) {
  if (tiles.length === 0) return null
  const rows: Countdown[][] = []
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

function Tile({ tile }: { tile: Countdown }) {
  const { theme: t } = useTheme()
  const today = tile.days === 0
  const when = today ? 'today' : `${tile.days} ${dayUnit(tile.days)} to go`
  const date = examTileDate(tile.dateMs)

  return (
    <PressableScale
      testID={`countdown-${tile.slug}`}
      onPress={() => router.push(`/listings/${tile.slug}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${tile.title}, ${when}, ${date}`}
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
      <Text role="footnote" color={t.textSecondary}>{date}</Text>
    </PressableScale>
  )
}
