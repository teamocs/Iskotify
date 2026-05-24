// Global Jest setup
process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://test.supabase.co'
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'test-anon-key'
process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ?? 'test-places-key'

// Native module shims for tests — both libs require native code that can't
// run under jest-expo. Replace with passthrough React Native components.
import 'react-native-gesture-handler/jestSetup'

jest.mock('react-native-keyboard-controller', () => {
  const RN = require('react-native')
  return {
    KeyboardProvider: ({ children }: { children: React.ReactNode }) => children,
    KeyboardAvoidingView: RN.KeyboardAvoidingView,
    KeyboardAwareScrollView: RN.ScrollView,
  }
})

// expo-screen-capture: stub the async prevent/allow APIs
jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
  allowScreenCaptureAsync: jest.fn().mockResolvedValue(undefined),
}))

// expo-navigation-bar: stub setVisibilityAsync + setBehaviorAsync
jest.mock('expo-navigation-bar', () => ({
  setVisibilityAsync: jest.fn().mockResolvedValue(undefined),
  setBehaviorAsync: jest.fn().mockResolvedValue(undefined),
  getVisibilityAsync: jest.fn().mockResolvedValue('visible'),
}))
