import { useEffect, useRef, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { motion, spacing } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'

interface Props {
  /** A new value (the step, the card) plays the transition; the first render does not. */
  pageKey: string | number
  /** 1 = moved forward (enters from the trailing edge), -1 = moved back. */
  direction?: 1 | -1
  style?: StyleProp<ViewStyle>
  children: ReactNode
  testID?: string
}

/** How far a page travels as it settles. */
export const PAGE_TRAVEL = spacing.xxl

/**
 * A paged flow's page change (onboarding steps, the tour's cards): the new
 * page slides in a short way on spring.smooth while it fades up. Under Reduce
 * Motion it is a 160ms crossfade with no travel. Transform and opacity only,
 * on the UI thread.
 */
export function PageTransition({ pageKey, direction = 1, style, children, testID }: Props) {
  const { reduceMotion } = usePlatformCapabilities()
  const progress = useSharedValue(1)
  const first = useRef(true)
  const dir = useSharedValue(direction)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    dir.value = direction
    progress.value = 0
    progress.value = reduceMotion
      ? withTiming(1, { duration: motion.duration.reduced })
      : withSpring(1, motion.spring.smooth)
    // Shared values are stable; the transition keys on the page alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  const animated = useAnimatedStyle(() => {
    const p = progress.value
    return {
      opacity: Math.min(1, Math.max(0, p)),
      transform: [{ translateX: reduceMotion ? 0 : (1 - p) * PAGE_TRAVEL * dir.value }],
    }
  })

  return (
    <Animated.View testID={testID} style={[style, animated]}>
      {children}
    </Animated.View>
  )
}
