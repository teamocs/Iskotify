import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { motion } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'

/** Opacity a pressed control dims to when Reduce Motion rules out scaling. */
const REDUCED_PRESS_OPACITY = 0.7

/** Target transform/opacity for a press state. */
export function pressFeedback(pressed: boolean, reduceMotion: boolean): { scale: number; opacity: number } {
  if (reduceMotion) return { scale: 1, opacity: pressed ? REDUCED_PRESS_OPACITY : 1 }
  return { scale: pressed ? motion.pressScale : 1, opacity: 1 }
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>
}

/**
 * A Pressable that settles to 0.97 the moment a finger lands and springs back
 * on release (spring.snappy). Under Reduce Motion it only dims. Animates
 * transform and opacity only, on the UI thread. Accessibility props pass
 * straight through, so give it a role and a label as you would a Pressable.
 *
 * The animated style is applied last, so a caller's `opacity` or `transform`
 * in `style` is overridden. Put those on a child view instead.
 */
export function PressableScale({ style, onPressIn, onPressOut, ...rest }: PressableScaleProps) {
  const { reduceMotion } = usePlatformCapabilities()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)

  const animate = (pressed: boolean) => {
    const to = pressFeedback(pressed, reduceMotion)
    scale.value = reduceMotion ? to.scale : withSpring(to.scale, motion.spring.snappy)
    opacity.value = withTiming(to.opacity, { duration: motion.duration.reduced })
  }

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }))

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => { animate(true); onPressIn?.(e) }}
      onPressOut={(e: GestureResponderEvent) => { animate(false); onPressOut?.(e) }}
      style={[style, animated]}
    />
  )
}
