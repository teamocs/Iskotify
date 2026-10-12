import { useEffect, useRef } from 'react'
import { Platform, Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { useTheme } from '../../theme/ThemeContext'
import { motion, radius, spacing, weight } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { selection } from '../../lib/haptics'
import { focusRing, type WebPressableState } from './a11y'
import { Text } from './Text'

export interface Segment<T extends string> {
  value: T
  label: string
  /** Defaults to the label. */
  accessibilityLabel?: string
}

export interface SegmentedControlProps<T extends string> {
  segments: readonly Segment<T>[]
  value: T
  onChange: (value: T) => void
  /** Names the group, e.g. "Time range". */
  accessibilityLabel: string
  style?: StyleProp<ViewStyle>
  testID?: string
}

/** Track inset around the thumb. */
const PAD = 2
/** The track is a 44pt target; each segment fills it less the inset. */
const TRACK_MIN = 44

/**
 * An iOS segmented control: a capsule track (surface2) with a white thumb
 * that slides to the chosen segment on spring.snappy. The thumb's x is
 * computed on the UI thread from the measured track width and the selected
 * index (shared values, no re-render per layout); under Reduce Motion it
 * jumps. A haptic tick marks each change.
 *
 * Accessibility: a tablist of tabs with aria-selected. On the web only the
 * selected tab is in the Tab order, and Left/Right arrows move the choice
 * (wrapping), as in the WAI-ARIA tabs pattern.
 */
export function SegmentedControl<T extends string>({
  segments, value, onChange, accessibilityLabel, style, testID,
}: SegmentedControlProps<T>) {
  const { theme: t } = useTheme()
  const { reduceMotion } = usePlatformCapabilities()
  const count = Math.max(1, segments.length)
  const selected = Math.max(0, segments.findIndex(s => s.value === value))
  const width = useSharedValue(0)
  const index = useSharedValue(selected)
  const refs = useRef<(View | null)[]>([])
  const web = Platform.OS === 'web'

  useEffect(() => {
    index.value = reduceMotion ? selected : withSpring(selected, motion.spring.snappy)
  }, [selected, reduceMotion, index])

  const thumb = useAnimatedStyle(() => {
    const segment = Math.max(0, (width.value - PAD * 2) / count)
    return {
      width: segment,
      opacity: width.value > 0 ? 1 : 0,
      transform: [{ translateX: index.value * segment }],
    }
  })

  const choose = (i: number) => {
    const next = segments[i]
    if (!next || next.value === value) return
    selection()
    onChange(next.value)
  }

  const onKeyDown = (i: number) => (e: { key?: string; preventDefault?: () => void }) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault?.()
    const to = (i + step + count) % count
    choose(to)
    ;(refs.current[to] as unknown as { focus?: () => void } | null)?.focus?.()
  }

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      onLayout={(e: LayoutChangeEvent) => { width.value = e.nativeEvent.layout.width }}
      style={[
        {
          flexDirection: 'row',
          minHeight: TRACK_MIN,
          padding: PAD,
          borderRadius: radius.capsule,
          backgroundColor: t.surface2,
        },
        style,
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute', top: PAD, bottom: PAD, left: PAD,
            borderRadius: radius.capsule,
            backgroundColor: t.surface,
            boxShadow: t.shadowSm,
          },
          thumb,
        ]}
      />
      {segments.map((seg, i) => {
        const on = i === selected
        const webProps = web ? ({ onKeyDown: onKeyDown(i), tabIndex: on ? 0 : -1 } as Record<string, unknown>) : null
        return (
          <Pressable
            key={seg.value}
            ref={(node) => { refs.current[i] = node }}
            onPress={() => choose(i)}
            accessibilityRole="tab"
            accessibilityLabel={seg.accessibilityLabel ?? seg.label}
            aria-selected={on}
            {...webProps}
            style={(state) => {
              const { focused } = state as WebPressableState
              return [
                {
                  flex: 1,
                  minHeight: TRACK_MIN - PAD * 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: spacing.md,
                  borderRadius: radius.capsule,
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <Text
              role="subheadline"
              color={on ? t.textPrimary : t.textSecondary}
              numberOfLines={1}
              chrome
              style={weight(on ? '600' : '500')}
            >
              {seg.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
