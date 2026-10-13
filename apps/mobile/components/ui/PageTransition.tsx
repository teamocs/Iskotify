import { useLayoutEffect, useState, type ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { motion } from '../../theme/tokens'
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

const HIDDEN = { opacity: 0 } as const

/** How far a page travels as it settles. */
export const PAGE_TRAVEL = motion.pageTravel

/**
 * A paged flow's page change (onboarding steps, the tour's cards): a short
 * 200ms ease-out crossfade with at most an 8pt slide, never a spring (owner
 * feedback 2026-10-13: no over-animated page swings). Under Reduce Motion it
 * is a 120ms crossfade with no travel. Transform and opacity only, on the UI
 * thread.
 */
export function PageTransition({ pageKey, direction = 1, style, children, testID }: Props) {
  const { reduceMotion } = usePlatformCapabilities()
  const progress = useSharedValue(1)
  const dir = useSharedValue(direction)
  // The page whose transition has started. Until the new page's transition
  // starts it is drawn at opacity 0, so its first frame never paints at full
  // opacity (the fade starts in the layout effect, before the browser or the
  // native view paints). The first page shows as is.
  const [startedKey, setStartedKey] = useState(pageKey)
  const pending = startedKey !== pageKey

  useLayoutEffect(() => {
    if (!pending) return
    dir.value = direction
    progress.value = 0
    progress.value = reduceMotion
      ? withTiming(1, { duration: motion.duration.reduced })
      : withTiming(1, { duration: motion.duration.page, easing: Easing.out(Easing.cubic) })
    setStartedKey(pageKey)
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
    <Animated.View testID={testID} style={[style, animated, pending ? HIDDEN : null]}>
      {children}
    </Animated.View>
  )
}
