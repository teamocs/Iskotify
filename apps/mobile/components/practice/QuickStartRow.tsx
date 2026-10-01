import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Flag1Outlined, StopwatchOutlined, Dumbbell1Outlined, RefreshCircle1ClockwiseOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import type { QuickStartKey, QuickStartTile } from '../../utils/practiceQuickStart'

const ICONS: Record<QuickStartKey, Parameters<typeof Lineicons>[0]['icon']> = {
  diagnostic: Flag1Outlined,
  sprint: StopwatchOutlined,
  drill: Dumbbell1Outlined,
  mistakes: RefreshCircle1ClockwiseOutlined,
}

interface Props {
  tiles: QuickStartTile[]
  onPress: (tile: QuickStartTile) => void
}

/**
 * The Practice tab's quick-start row (P4): four equal tiles, two per line on
 * phones and four across from medium up (they wrap by width). Each tile is
 * one button with a spoken "Title, subtitle" name and a 64pt minimum height.
 * Secondary to the Next step card: surface tiles, never the maroon fill.
 */
export function QuickStartRow({ tiles, onPress }: Props) {
  const { theme: t } = useTheme()
  return (
    <View testID="practice-quick-start" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {tiles.map(tile => (
        <Pressable
          key={tile.key}
          onPress={() => onPress(tile)}
          accessibilityRole="button"
          accessibilityLabel={`${tile.title}, ${tile.subtitle}`}
          style={(state) => {
            const { pressed, focused } = state as WebPressableState
            return [
              {
                flexGrow: 1, flexBasis: 140, minHeight: 64, gap: spacing.xs,
                padding: spacing.md, borderRadius: radius.lg, borderCurve: 'continuous',
                borderWidth: 1, borderColor: t.border,
                backgroundColor: pressed ? t.surface2 : t.surface,
              },
              focusRing(t.focusRing, focused),
            ]
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View {...decorative}>
              <Lineicons icon={ICONS[tile.key]} size={18} color={tile.muted ? t.textTertiary : t.accentText} />
            </View>
            <Text style={[textStyle('titleSm', tile.muted ? t.textSecondary : t.textPrimary), { flexShrink: 1 }]} numberOfLines={1} maxFontSizeMultiplier={2}>
              {tile.title}
            </Text>
          </View>
          <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={2} maxFontSizeMultiplier={2}>
            {tile.subtitle}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
