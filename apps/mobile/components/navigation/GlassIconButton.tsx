import type { RefObject } from 'react'
import { Pressable, View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { useTheme } from '../../theme/ThemeContext'
import { layout } from '../../theme/tokens'
import { Glass } from '../ui/Glass'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'

type IconData = Parameters<typeof Lineicons>[0]['icon']

export interface GlassIconButtonProps {
  icon: IconData
  /** Required: an icon-only control is unnamed without it. */
  accessibilityLabel: string
  onPress: () => void
  accessibilityHint?: string
  /** Android API 31+: the BlurTargetView behind the button (see <Glass>). */
  blurTarget?: RefObject<View | null>
  testID?: string
}

const { visual: VISUAL, hit: HIT } = layout.headerButton

/**
 * A round glass header button: a 40pt glass disc inside a 44pt target, the
 * icon in textPrimary (it can float over maroon content; see glass tokens).
 */
export function GlassIconButton({ icon, accessibilityLabel, onPress, accessibilityHint, blurTarget, testID }: GlassIconButtonProps) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={(state) => {
        const { pressed, focused } = state as WebPressableState
        return [
          {
            minWidth: HIT, minHeight: HIT, borderRadius: HIT / 2,
            alignItems: 'center', justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <Glass variant="button" blurTarget={blurTarget} style={{ width: VISUAL, height: VISUAL, alignItems: 'center', justifyContent: 'center' }}>
        <View {...decorative}>
          <Lineicons icon={icon} size={20} color={t.textPrimary} />
        </View>
      </Glass>
    </Pressable>
  )
}
