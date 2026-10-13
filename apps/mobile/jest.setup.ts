// Global Jest setup
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? 'test-places-key'

// Native module shims for tests — both libs require native code that can't
// run under jest-expo. Replace with passthrough React Native components.
import 'react-native-gesture-handler/jestSetup'

// Worklets 0.7 (Expo SDK 55) throws at import when its native part is
// missing; Reanimated imports it, so tests use the library's own JS mock.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'))

// The device's glass tier and accessibility flags as a static, synchronous
// value (Reduce Motion and Reduce Transparency off, the tier the current
// Platform.OS would get). The real hook is a module-level store that answers
// AccessibilityInfo asynchronously and pushes the result to every subscriber
// outside act(), which raced fake timers in CI (run 38355062895). Tests of the
// store itself opt back in with jest.unmock (hooks/__tests__/
// usePlatformCapabilities.test.ts); a test that needs other values mocks the
// hook in its own file.
jest.mock('./hooks/usePlatformCapabilities', () => {
  const actual = jest.requireActual('./hooks/usePlatformCapabilities')
  const { Platform } = jest.requireActual('react-native')
  return {
    ...actual,
    usePlatformCapabilities: () => {
      const os = Platform.OS
      const liquidGlass = actual.detectLiquidGlass(os)
      return {
        liquidGlass,
        blurTier: actual.resolveBlurTier({
          os,
          apiLevel: os === 'android' && typeof Platform.Version === 'number' ? Platform.Version : undefined,
          liquidGlass,
          reduceTransparency: false,
          cssBackdrop: false,
        }),
        reduceTransparency: false,
        reduceMotion: false,
      }
    },
  }
})

// Reanimated's own JS mock: shared values are plain objects, withSpring /
// withTiming settle instantly, useAnimatedStyle runs its worklet once.
// (iOS redesign P1a: PressableScale and the coming springs.)
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

jest.mock('react-native-keyboard-controller', () => {
  const RN = require('react-native')
  return {
    KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
    KeyboardAvoidingView: RN.KeyboardAvoidingView,
    KeyboardAwareScrollView: RN.ScrollView,
    // The floating tab bar rides above the keyboard (iOS redesign P2c).
    KeyboardStickyView: RN.View,
    // Keyboard closed in tests: height 0 (negative when open), progress 0.
    useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  }
})

// expo-image: no native module under jest — shim with a plain RN Image host
// component (same props surface: source/style/onError/accessibility*) and a
// jest.fn() static `prefetch` so offline-prefetch tests can assert calls
// without real network/disk I/O.
jest.mock('expo-image', () => {
  const React = require('react')
  const RN = require('react-native')
  const ExpoImage = React.forwardRef((props: any, ref: any) =>
    React.createElement(RN.Image, { ...props, ref }))
  ExpoImage.displayName = 'ExpoImage'
  ExpoImage.prefetch = jest.fn().mockResolvedValue(true)
  return { Image: ExpoImage }
})
