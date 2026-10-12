import { useState } from 'react'
import {
  Pressable, StyleSheet, type GestureResponderEvent, type NativeSyntheticEvent, type PressableProps, type StyleProp,
  type TargetedEvent, type ViewStyle,
} from 'react-native'
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

/** The interaction state a style function receives (hovered/focused: web only). */
export interface PressableScaleState { pressed: boolean; hovered: boolean; focused: boolean }

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** A style, or a function of the press/hover/focus state (like Pressable's). */
  style?: StyleProp<ViewStyle> | ((state: PressableScaleState) => StyleProp<ViewStyle>)
}

type FocusEvent = NativeSyntheticEvent<TargetedEvent>

/**
 * A Pressable that settles to 0.97 the moment a finger lands and springs back
 * on release (spring.snappy). Under Reduce Motion it only dims. Animates
 * transform and opacity only, on the UI thread. Accessibility props pass
 * straight through, so give it a role and a label as you would a Pressable.
 *
 * `style` may be a function of { pressed, hovered, focused }, so a control can
 * tint on press, tint on web hover and draw the keyboard focus ring. The state
 * is tracked here (an animated Pressable can't take a style function), and
 * only when a function is given.
 *
 * The animated style is applied last, so a caller's `transform` in `style` is
 * overridden (put it on a child view); a numeric `opacity` is multiplied in.
 */
export function PressableScale({
  style, onPressIn, onPressOut, onHoverIn, onHoverOut, onFocus, onBlur, ...rest
}: PressableScaleProps) {
  const { reduceMotion } = usePlatformCapabilities()
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const tracks = typeof style === 'function'
  const [state, setState] = useState<PressableScaleState>({ pressed: false, hovered: false, focused: false })
  const mark = (patch: Partial<PressableScaleState>) => {
    if (tracks) setState(s => ({ ...s, ...patch }))
  }

  const animate = (pressed: boolean) => {
    const to = pressFeedback(pressed, reduceMotion)
    scale.value = reduceMotion ? to.scale : withSpring(to.scale, motion.spring.snappy)
    opacity.value = withTiming(to.opacity, { duration: motion.duration.reduced })
  }

  const resolved = typeof style === 'function' ? style(state) : style
  // A caller's own opacity (e.g. a disabled control at 0.5) is kept: the
  // press dim multiplies it instead of replacing it.
  const baseOpacity = (StyleSheet.flatten(resolved) as ViewStyle | undefined)?.opacity
  const restOpacity = typeof baseOpacity === 'number' ? baseOpacity : 1

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value * restOpacity,
    transform: [{ scale: scale.value }],
  }))

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => { animate(true); mark({ pressed: true }); onPressIn?.(e) }}
      onPressOut={(e: GestureResponderEvent) => { animate(false); mark({ pressed: false }); onPressOut?.(e) }}
      onHoverIn={(e) => { mark({ hovered: true }); onHoverIn?.(e) }}
      onHoverOut={(e) => { mark({ hovered: false }); onHoverOut?.(e) }}
      onFocus={(e: FocusEvent) => { mark({ focused: true }); onFocus?.(e) }}
      onBlur={(e: FocusEvent) => { mark({ focused: false }); onBlur?.(e) }}
      style={[resolved, animated]}
    />
  )
}
