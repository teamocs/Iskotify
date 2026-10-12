import { useEffect, useRef } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined, ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { motion, spacing } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { InsetGroup } from '../ui/InsetGroup'
import { PressableScale } from '../ui/Pressable'
import { Text } from '../ui/Text'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { TodaySectionHeader } from './TodaySectionHeader'
import { planItemCopy, type PlanItemLike } from '../../utils/todayNextStep'

/** The check circle's diameter (pt). */
export const CHECK_SIZE = 24

interface Props {
  items: PlanItemLike[]
  /** topicId → display name, from the already-loaded topic catalog. */
  topicNameById: Map<string, string>
  onMarkComplete: (id: number) => void
}

/**
 * Today's plan as an inset group with an "N of M" count. Each row has a 24pt
 * check circle (its own 44pt checkbox target) and a body that opens the task.
 * Done rows read in textSecondary with a strikethrough. Renders nothing
 * without items: the hero (NextStepCard) owns the loading, error and
 * all-caught-up states.
 */
export function TodaysPlanFold({ items, topicNameById, onMarkComplete }: Props) {
  if (items.length === 0) return null
  const done = items.filter(i => i.completedAt != null).length

  return (
    <View testID="todays-plan">
      <TodaySectionHeader title="Today's plan" meta={`${done} of ${items.length}`} metaLabel={`${done} of ${items.length} done`} />
      <InsetGroup inset={false}>
        {items.map((item, i) => (
          <PlanRow
            key={item.id}
            item={item}
            last={i === items.length - 1}
            topicNameById={topicNameById}
            onMarkComplete={onMarkComplete}
          />
        ))}
      </InsetGroup>
    </View>
  )
}

function PlanRow({ item, last, topicNameById, onMarkComplete }: {
  item: PlanItemLike
  last: boolean
  topicNameById: Map<string, string>
  onMarkComplete: (id: number) => void
}) {
  const { theme: t } = useTheme()
  const done = item.completedAt != null
  const copy = planItemCopy(item, topicNameById)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
      <Pressable
        onPress={() => { if (!done) onMarkComplete(item.id) }}
        accessibilityRole="checkbox"
        accessibilityLabel={copy.title}
        accessibilityHint={done ? undefined : 'Marks this as done'}
        aria-checked={done}
        style={(state) => {
          const { focused } = state as WebPressableState
          return [
            { width: 52, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        <CheckCircle done={done} />
      </Pressable>
      <PressableScale
        onPress={() => router.push(copy.route as never)}
        accessibilityRole="button"
        accessibilityLabel={`${copy.title}, ${copy.detail}`}
        style={({ pressed, hovered, focused }) => [
          {
            flex: 1, minWidth: 0, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
            paddingVertical: spacing.sm, paddingRight: spacing.lg,
            backgroundColor: pressed ? t.surface2 : hovered ? t.surfaceSubtle : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text
            role="body"
            color={done ? t.textSecondary : t.textPrimary}
            numberOfLines={2}
            style={done ? { textDecorationLine: 'line-through' } : null}
          >
            {copy.title}
          </Text>
          <Text role="subheadline" color={t.textSecondary} numberOfLines={2}>
            {done ? 'Done' : copy.detail}
          </Text>
        </View>
        <View {...decorative} style={{ transform: [{ scaleX: -1 }] }}>
          <Lineicons icon={ChevronLeftOutlined} size={14} color={t.textTertiary} />
        </View>
        {last ? null : (
          <View
            {...decorative}
            style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.divider }}
          />
        )}
      </PressableScale>
    </View>
  )
}

/**
 * The 24pt check circle: an inputBorder ring, or a filled success disc with a
 * white check. Checking it pops the disc in on spring.bouncy (once); under
 * Reduce Motion the disc crossfades in (160ms). Decorative: the Pressable
 * around it is the checkbox.
 */
export function CheckCircle({ done }: { done: boolean }) {
  const { theme: t } = useTheme()
  const { reduceMotion } = usePlatformCapabilities()
  const fill = useSharedValue(done ? 1 : 0)
  const scale = useSharedValue(1)
  const mounted = useRef(false)

  useEffect(() => {
    // The first render shows the state as it is; only a change animates.
    if (!mounted.current) { mounted.current = true; return }
    if (reduceMotion || !done) {
      scale.value = 1
      fill.value = withTiming(done ? 1 : 0, { duration: motion.duration.reduced })
      return
    }
    fill.value = 1
    scale.value = withSequence(withTiming(0.6, { duration: 0 }), withSpring(1, motion.spring.bouncy))
    // Shared values are stable; listing them would re-run this on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, reduceMotion])

  const disc = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: scale.value }] }))

  return (
    <View
      testID="check-circle"
      {...decorative}
      style={{
        width: CHECK_SIZE, aspectRatio: 1, borderRadius: CHECK_SIZE / 2, borderWidth: 2,
        borderColor: done ? t.success : t.inputBorder, alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Animated.View
        testID="check-circle-fill"
        style={[
          {
            position: 'absolute', top: -2, left: -2, right: -2, bottom: -2,
            borderRadius: CHECK_SIZE / 2, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center',
          },
          disc,
        ]}
      >
        <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} />
      </Animated.View>
    </View>
  )
}
