import { useEffect, useRef } from 'react'
import { I18nManager, Platform, Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native'
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
 * Accessibility: a radiogroup of radios with aria-checked (it switches a
 * value, there is no tab panel, so not a tablist). On the web only the
 * selected radio is in the Tab order; Left/Right move the choice (wrapping),
 * Home/End jump to the ends and Space selects, as in the WAI-ARIA radio group
 * pattern.
 *
 * RTL: the app ships left-to-right only and the thumb has not been checked in
 * a mirrored layout. As a guard, under I18nManager.isRTL it anchors to the
 * start edge and travels the other way, matching the reversed row.
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
  const direction = I18nManager.isRTL ? -1 : 1

  useEffect(() => {
    index.value = reduceMotion ? selected : withSpring(selected, motion.spring.snappy)
  }, [selected, reduceMotion, index])

  const thumb = useAnimatedStyle(() => {
    const segment = Math.max(0, (width.value - PAD * 2) / count)
    return {
      width: segment,
      opacity: width.value > 0 ? 1 : 0,
      transform: [{ translateX: direction * index.value * segment }],
    }
  })

  const choose = (i: number) => {
    const next = segments[i]
    if (!next || next.value === value) return
    selection()
    onChange(next.value)
  }

  const onKeyDown = (i: number) => (e: { key?: string; repeat?: boolean; preventDefault?: () => void }) => {
    let to: number
    switch (e.key) {
      case 'ArrowRight': to = (i + 1) % count; break
      case 'ArrowLeft':  to = (i - 1 + count) % count; break
      case 'Home':       to = 0; break
      case 'End':        to = count - 1; break
      case ' ':
      case 'Spacebar':   to = i; break
      default: return
    }
    e.preventDefault?.() // keep the page from scrolling
    if (e.repeat && to === i) return
    choose(to)
    ;(refs.current[to] as unknown as { focus?: () => void } | null)?.focus?.()
  }

  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
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
            position: 'absolute', top: PAD, bottom: PAD, start: PAD,
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
            accessibilityRole="radio"
            accessibilityLabel={seg.accessibilityLabel ?? seg.label}
            aria-checked={on}
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
