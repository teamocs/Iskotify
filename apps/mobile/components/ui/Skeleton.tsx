import { useEffect, useRef } from 'react'
import { Animated, Platform, type DimensionValue } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius as radii } from '../../theme/tokens'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { decorative } from './a11y'

interface Props {
  width?: DimensionValue
  height?: number
  radius?: number
  /**
   * Announce this block as "Loading" (busy). Off by default: a screen of
   * skeleton bars should announce once, so set it on ONE skeleton per group
   * (or put the label on the group's container instead) and leave the rest
   * silent — they are then hidden from assistive tech entirely.
   */
  accessible?: boolean
  /** Spoken label when `accessible`. */
  label?: string
}

/**
 * Placeholder block while content loads. A slow opacity pulse — or perfectly
 * still when the OS asks for reduced motion.
 */
export function Skeleton({ width = '100%', height = 16, radius = radii.sm, accessible = false, label = 'Loading' }: Props) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1)
      return
    }
    // isInteraction: false — without the native driver (web) an endless pulse
    // would otherwise hold an InteractionManager handle open, and loads queued
    // with runAfterInteractions would never run while the skeleton shows.
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
        ? { accessible: true, accessibilityLabel: label, 'aria-busy': true }
        : decorative)}
      style={{ width, height, borderRadius: radius, backgroundColor: t.surface2, opacity }}
    />
  )
}
