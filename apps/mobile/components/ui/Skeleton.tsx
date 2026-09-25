import { useEffect, useRef } from 'react'
import { Animated, Platform, type DimensionValue } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius as radii } from '../../theme/tokens'
import { useReducedMotion } from '../../hooks/useReducedMotion'

interface Props {
  width?: DimensionValue
  height?: number
  radius?: number
  /** Accessible label; one skeleton group should carry it, not every bar. */
  label?: string
}

/**
 * Placeholder block while content loads. A slow opacity pulse — or perfectly
 * still when the OS asks for reduced motion.
 */
export function Skeleton({ width = '100%', height = 16, radius = radii.sm, label = 'Loading' }: Props) {
  const { theme: t } = useTheme()
  const reduced = useReducedMotion()
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1)
      return
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    )
    pulse.start()
    return () => pulse.stop()
  }, [reduced, opacity])

  return (
    <Animated.View
      accessible
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={{ width, height, borderRadius: radius, backgroundColor: t.surface2, opacity }}
    />
  )
}
