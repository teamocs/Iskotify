import { useEffect, useRef, type ReactNode } from 'react'
import { Platform, type View } from 'react-native'
import { BlurTargetView } from 'expo-blur'
import { useTabBarScroll } from './TabBarScrollContext'

/**
 * Android API 31+ blurs only what sits inside a BlurTargetView, and the blur
 * must be drawn OUTSIDE it. Each tab scene's content goes in its own target
 * (the tab navigator's `screenLayout`); the floating bar, rendered after the
 * scenes, hands the focused scene's ref to its <Glass>. Android below API 31
 * has no blur (the bar is opaque there) and other platforms blur the backdrop
 * natively, so both get the children as they are.
 */
export function SceneBlurTarget({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const ref = useRef<View>(null)
  const register = useTabBarScroll()?.registerBlurTarget
  const blurs = Platform.OS === 'android' && Number(Platform.Version) >= 31

  useEffect(() => {
    if (!blurs || !register) return
    register(routeKey, ref)
    return () => register(routeKey, null)
  }, [blurs, register, routeKey])

  if (!blurs) return <>{children}</>
  return (
    <BlurTargetView ref={ref} style={{ flex: 1 }}>
      {children}
    </BlurTargetView>
  )
}
