import { useCallback } from 'react'
import { Dimensions, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useSharedValue, runOnJS } from 'react-native-reanimated'
import { router, usePathname } from 'expo-router'

const TAB_PATHS = ['/', '/practice', '/listings', '/analytics', '/profile'] as const
const TAB_HREFS = [
  '/(tabs)',
  '/(tabs)/practice',
  '/(tabs)/listings',
  '/(tabs)/analytics',
  '/(tabs)/profile',
] as const

const EDGE_WIDTH = 30
const SWIPE_DISTANCE = 50
const SWIPE_VELOCITY = 500

export function EdgeSwipeNavigator({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const screenWidth = Dimensions.get('window').width
  const startX = useSharedValue(screenWidth / 2)

  const navigateTo = useCallback((direction: 'left' | 'right') => {
    const idx = (TAB_PATHS as readonly string[]).indexOf(pathname)
    if (idx === -1) return
    const next = direction === 'left' ? idx + 1 : idx - 1
    if (next < 0 || next >= TAB_HREFS.length) return
    router.navigate(TAB_HREFS[next] as never)
  }, [pathname])

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onBegin((e) => {
      'worklet'
      startX.value = e.x
    })
    .onEnd((e) => {
      'worklet'
      const inLeftEdge = startX.value < EDGE_WIDTH
      const inRightEdge = startX.value > screenWidth - EDGE_WIDTH
      if (!inLeftEdge && !inRightEdge) return
      const swipeLeft = e.translationX < -SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
      const swipeRight = e.translationX > SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
      if (swipeLeft) runOnJS(navigateTo)('left')
      else if (swipeRight) runOnJS(navigateTo)('right')
    })

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  )
}
