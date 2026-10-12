import { useEffect, useRef, type ReactNode } from 'react'
import { Platform, type View } from 'react-native'
import { BlurTargetView } from 'expo-blur'
import { useTabBarScroll } from './TabBarScrollContext'

/**
 * Android API 31+ blurs only what sits inside a BlurTargetView, and the blur
 * must be drawn OUTSIDE it. Each tab scene's content goes in its own target
 * (the tab navigator's `screenLayout`); the floating bar, rendered after the
 * scenes, hands the focused scene's ref to its <Glass>. Other platforms blur
 * the backdrop natively and get the children as they are.
 */
export function SceneBlurTarget({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const ref = useRef<View>(null)
  const register = useTabBarScroll()?.registerBlurTarget
  const android = Platform.OS === 'android'

  useEffect(() => {
    if (!android || !register) return
    register(routeKey, ref)
    return () => register(routeKey, null)
  }, [android, register, routeKey])

  if (!android) return <>{children}</>
  return (
    <BlurTargetView ref={ref} style={{ flex: 1 }}>
      {children}
    </BlurTargetView>
  )
}
