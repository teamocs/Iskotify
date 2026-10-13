import { ScrollView, View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, weight } from '../../theme/tokens'
import { selection } from '../../lib/haptics'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { focusRing } from '../ui/a11y'

export interface RailSection<T extends string> {
  key: T
  label: string
}

interface Props<T extends string> {
  sections: readonly RailSection<T>[]
  value: T
  onChange: (next: T) => void
  /** Names the tab list for assistive tech. */
  accessibilityLabel: string
  testID?: string
}

/** The visual capsule is 36pt; the hit slop brings every chip to 44. */
const CHIP_MIN = 36
const SLOP = { top: (44 - CHIP_MIN) / 2, bottom: (44 - CHIP_MIN) / 2, left: 0, right: 0 }

/**
 * Explore's section switcher for more sections than a segmented control
 * holds: a horizontally scrolling rail of capsule chips. The selected chip is
 * an ink capsule with white text; the rest sit on the surface. A tablist of
 * tabs with aria-selected (each section swaps the list below), a haptic tick
 * per change. On iOS the rail sits after the section list in the tree (see
 * app/(tabs)/explore.tsx), so native tabs never track this horizontal scroll.
 */
export function SectionRail<T extends string>({ sections, value, onChange, accessibilityLabel, testID }: Props<T>) {
  const { theme: t } = useTheme()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ paddingVertical: (44 - CHIP_MIN) / 2 }}
    >
      <View
        testID={testID}
        accessibilityRole="tablist"
        accessibilityLabel={accessibilityLabel}
        style={{ flexDirection: 'row', gap: spacing.sm }}
      >
        {sections.map(({ key, label }) => {
          const on = key === value
          // react-native-web only lets Space activate role="button"; a tab must too.
          const webKeys = {
            onKeyDown: (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
              if (e.key !== ' ' && e.key !== 'Spacebar') return
              e.preventDefault?.()
              if (!e.repeat && !on) { selection(); onChange(key) }
            },
          } as Record<string, unknown>
          return (
            <PressableScale
              key={key}
              {...webKeys}
              hitSlop={SLOP}
              onPress={() => { if (on) return; selection(); onChange(key) }}
              accessibilityRole="tab"
              accessibilityLabel={label}
              aria-selected={on}
              style={({ pressed, focused }) => [
                {
                  minHeight: CHIP_MIN,
                  justifyContent: 'center',
                  paddingHorizontal: spacing.lg,
                  borderRadius: radius.capsule,
                  borderWidth: 1,
                  borderColor: on ? t.textPrimary : t.border,
                  backgroundColor: on ? t.textPrimary : pressed ? t.surface2 : t.surface,
                },
                focusRing(t.focusRing, focused),
              ]}
            >
              <Text role="subheadline" chrome color={on ? t.textInverse : t.textPrimary} style={weight(on ? '600' : '500')} numberOfLines={1}>
                {label}
              </Text>
            </PressableScale>
          )
        })}
      </View>
    </ScrollView>
  )
}
