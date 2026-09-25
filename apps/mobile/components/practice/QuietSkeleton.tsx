import { useEffect, useRef } from 'react'
import { Animated, Platform, type DimensionValue } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius as radii } from '../../theme/tokens'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { decorative } from '../ui/a11y'

interface Props {
  width?: DimensionValue
  height?: number
  radius?: number
  /** Announce this block as busy (set on ONE skeleton per group). */
  accessible?: boolean
  label?: string
}

/**
 * ui/Skeleton, minus one bug: its pulse is marked `isInteraction: false`.
 *
 * On web there is no native driver, so Animated.timing defaults to
 * isInteraction: true and an endless pulse holds an InteractionManager handle
 * open for as long as the skeleton is mounted. Any load scheduled with
 * runAfterInteractions (usePracticeData, useHomeStats, useStudyPlan) then
 * never runs, and the skeleton never goes away. ui/Skeleton is a frozen M1
 * primitive, so the Practice area uses this until the primitive takes the
 * same one-line fix.
 */
export function QuietSkeleton({ width = '100%', height = 16, radius = radii.sm, accessible = false, label = 'Loading' }: Props) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1)
      return
    }
    const native = Platform.OS !== 'web'
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: native, isInteraction: false }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: native, isInteraction: false }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [reduced, opacity])

  return (
    <Animated.View
      {...(accessible
        ? { accessible: true, accessibilityLabel: label, accessibilityState: { busy: true } }
        : decorative)}
      style={{ width, height, borderRadius: radius, backgroundColor: t.surface2, opacity }}
    />
  )
}
