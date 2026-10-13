import { useEffect } from 'react'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckOutlined } from '@lineiconshq/free-icons'
import { motion } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { decorative } from '../ui/a11y'

/**
 * The correct-answer check. It is the one place a correct answer moves: the
 * glyph scales in on spring.bouncy exactly once, when it mounts, and never
 * loops. Under Reduce Motion it only crossfades in (motion.duration.reduced).
 * Decorative: the word "Correct" beside it carries the meaning.
 */
export function AnimatedCheck({ color, size = 16 }: { color: string; size?: number }) {
  const { reduceMotion } = usePlatformCapabilities()
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = reduceMotion
      ? withTiming(1, { duration: motion.duration.reduced })
      : withSpring(1, motion.spring.bouncy)
    // Once per mount: re-renders never replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const style = useAnimatedStyle(() => (reduceMotion
    ? { opacity: progress.value, transform: [{ scale: 1 }] }
    : { opacity: 1, transform: [{ scale: progress.value }] }))

  return (
    <Animated.View testID="animated-check" {...decorative} style={style}>
      <Lineicons icon={CheckOutlined} size={size} color={color} />
    </Animated.View>
  )
}
