import { useEffect, useRef, type ReactNode } from 'react'
import { Animated, Platform } from 'react-native'
import { usePathname } from 'expo-router'

/**
 * Web-only route-change fade, applying the view-transitions playbook within
 * RN-Web constraints: React's <ViewTransition> needs React canary (Next.js),
 * which Expo's stable React can't use, so this animates a quick opacity pulse
 * on pathname change instead. Lateral fade (not directional slide) is the
 * correct grammar for tab-style navigation; it never remounts children (no
 * state loss), restarts cleanly if navigation interrupts it, and is disabled
 * entirely under prefers-reduced-motion.
 */
export function RouteFade({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const opacity = useRef(new Animated.Value(1)).current
  const firstRender = useRef(true)
  const reducedMotion = useRef(
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (reducedMotion.current) return
    opacity.setValue(0.25)
    const anim = Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: false, // no native driver on web
    })
    anim.start()
    return () => anim.stop()
  }, [pathname, opacity])

  return <Animated.View style={{ flex: 1, opacity }}>{children}</Animated.View>
}
