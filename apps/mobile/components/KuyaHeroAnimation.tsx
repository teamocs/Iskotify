// RN Image is fine for tiny bundled assets; adding expo-image is a native module that would break OTA delivery.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Platform, Image } from 'react-native'

interface Props {
  width?: number
  height?: number
}

/**
 * Animated Kuya Baw mascot for the Home hero band.
 *
 * Native: Lottie animation (transparent background — the maroon band shows
 * through). lottie-react-native is required lazily inside the native branch so
 * the web bundle never imports it (avoids lottie-web peer issues on Vercel).
 * Web: falls back to the static mascot PNG.
 *
 * Asset is 320×272 (aspect 1.176) — default display size keeps that ratio.
 */
export function KuyaHeroAnimation({ width = 175, height = 149 }: Props) {
  if (Platform.OS === 'web') {
    return (
      <Image
        source={require('../assets/images/kuya-baw-mascot.png')}
        style={{ width, height }}
        resizeMode="contain"
      />
    )
  }

  // Lazy require keeps lottie-react-native out of the web bundle entirely.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const LottieView = require('lottie-react-native').default
  return (
    <LottieView
      source={require('../assets/animations/kuya-baw-hero.json')}
      autoPlay
      loop
      style={{ width, height }}
    />
  )
}
