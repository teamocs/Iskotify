import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Flag1Outlined, StopwatchOutlined, Dumbbell1Outlined, RefreshCircle1ClockwiseOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, type Theme } from '../../theme/tokens'
import { decorative, focusRing } from '../ui/a11y'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import type { QuickStartKey, QuickStartTile } from '../../utils/practiceQuickStart'

const ICONS: Record<QuickStartKey, Parameters<typeof Lineicons>[0]['icon']> = {
  diagnostic: Flag1Outlined,
  sprint: StopwatchOutlined,
  drill: Dumbbell1Outlined,
  mistakes: RefreshCircle1ClockwiseOutlined,
}

/** Each way to practise keeps its own tint, so the 2×2 grid scans at a glance. */
const TINT: Record<QuickStartKey, { bg: keyof Theme; fg: keyof Theme }> = {
  sprint:     { bg: 'accentSurface',  fg: 'accentText' },
  drill:      { bg: 'successSurface', fg: 'successStrong' },
  mistakes:   { bg: 'warningSurface', fg: 'warningStrong' },
  diagnostic: { bg: 'surface2',       fg: 'textSecondary' },
}

/** The 36pt tinted icon square that leads a tile. Decorative, holds no text. */
const ICON_TILE = 36

interface Props {
  tiles: QuickStartTile[]
  onPress: (tile: QuickStartTile) => void
}

/**
 * The Practice tab's "ways to practise" (iOS redesign P4): white 18pt tiles,
 * two per line on phones and four across from medium up, each led by a
 * tinted 36pt icon tile. One button per tile with a spoken "Title, subtitle"
 * name, at least 88 tall and growing with Dynamic Type. Never the maroon
 * fill: the mock hero holds the screen's one primary action. A disabled tile
 * (target still loading) is announced as such and ignores taps.
 */
export function QuickStartRow({ tiles, onPress }: Props) {
  const { theme: t } = useTheme()
  return (
    <View testID="practice-quick-start" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {tiles.map(tile => {
        const tint = TINT[tile.key]
        return (
          <PressableScale
            key={tile.key}
            onPress={() => onPress(tile)}
            disabled={tile.disabled}
            aria-disabled={tile.disabled}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}, ${tile.subtitle}`}
            style={({ pressed, focused }) => [
              {
                flexGrow: 1, flexBasis: 140, minHeight: 88, gap: spacing.sm,
                padding: spacing.md, borderRadius: radius.group, borderCurve: 'continuous',
                backgroundColor: pressed ? t.surface2 : t.surface,
              },
              focusRing(t.focusRing, focused),
            ]}
          >
            <View
              {...decorative}
              style={{
                width: ICON_TILE, height: ICON_TILE, borderRadius: radius.button, borderCurve: 'continuous',
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: tile.muted ? t.surface2 : t[tint.bg],
              }}
            >
              <Lineicons icon={ICONS[tile.key]} size={18} color={tile.muted ? t.textTertiary : t[tint.fg]} />
            </View>
            <View style={{ gap: 2 }}>
              <Text role="headline" color={tile.muted ? t.textSecondary : t.textPrimary} numberOfLines={1} maxFontSizeMultiplier={2}>
                {tile.title}
              </Text>
              <Text role="footnote" color={t.textSecondary} numberOfLines={2} maxFontSizeMultiplier={2}>
                {tile.subtitle}
              </Text>
            </View>
          </PressableScale>
        )
      })}
    </View>
  )
}
