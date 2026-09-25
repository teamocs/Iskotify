import { View } from 'react-native'
import { spacing } from '../../theme/tokens'
import { useBreakpoint, columnCount } from '../../hooks/useBreakpoint'

interface Props {
  /** The main task column (wider). */
  primary: React.ReactNode
  /** Supporting column (countdown, filters, detail). Stacks BELOW primary on narrow screens. */
  secondary: React.ReactNode
  gap?: number
}

/**
 * Two columns side by side on expanded widths (desktop web, landscape
 * tablets); one stacked column otherwise. Pair with <Screen width="wide">.
 */
export function TwoColumn({ primary, secondary, gap = spacing.xxl }: Props) {
  const twoUp = columnCount(useBreakpoint()) === 2
  return (
    <View
      testID="two-column"
      style={{ flexDirection: twoUp ? 'row' : 'column', alignItems: twoUp ? 'flex-start' : 'stretch', gap }}
    >
      <View style={twoUp ? { flex: 3, minWidth: 0 } : undefined}>{primary}</View>
      <View style={twoUp ? { flex: 2, minWidth: 0 } : undefined}>{secondary}</View>
    </View>
  )
}
