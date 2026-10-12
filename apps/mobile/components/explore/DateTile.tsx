import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { Text } from '../ui/Text'
import { decorative } from '../ui/a11y'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Month index (0-11) and day of a timestamp or an ISO yyyy-mm-dd date. */
function parts(date: number | string): { m: number; d: number } {
  if (typeof date === 'string') {
    const [, m, d] = date.split('-').map(Number)
    return { m: (m ?? 1) - 1, d: d ?? 1 }
  }
  const dt = new Date(date)
  return { m: dt.getMonth(), d: dt.getDate() }
}

/**
 * A small calendar leaf: the month over a tabular day number, 44pt wide.
 * Decorative: the row it leads names the exact date in words.
 */
export function DateTile({ date, testID = 'date-tile' }: { date: number | string; testID?: string }) {
  const { theme: t } = useTheme()
  const { m, d } = parts(date)
  return (
    <View
      testID={testID}
      {...decorative}
      style={{
        width: 44, minHeight: 48, borderRadius: radius.field, borderCurve: 'continuous',
        backgroundColor: t.accentSurface,
        alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs,
      }}
    >
      <Text role="caption" color={t.accentText} chrome style={[weight('600'), { textTransform: 'uppercase' }]}>
        {MONTHS[m] ?? ''}
      </Text>
      <Text role="title3" chrome style={{ fontVariant: ['tabular-nums'] }}>{String(d)}</Text>
    </View>
  )
}
