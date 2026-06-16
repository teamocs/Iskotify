import LottieView from 'lottie-react-native'

interface Props {
  width?: number
  height?: number
}

/**
 * Animated Kuya Baw mascot for the Home hero band (NATIVE).
 *
 * Lottie animation with a transparent background — the maroon band shows
 * through. The WEB build resolves KuyaHeroAnimation.web.tsx instead (static
 * PNG), so lottie-react-native — and its web entry's @lottiefiles/dotlottie-react
 * peer — never enters the web bundle. Metro bundles every require() statically,
 * so a platform file (not a runtime branch) is what keeps lottie off web.
 *
 * Asset is 320×272 (aspect 1.176) — default display size keeps that ratio.
 */
export function KuyaHeroAnimation({ width = 175, height = 149 }: Props) {
  return (
    <LottieView
      source={require('../assets/animations/kuya-baw-hero.json')}
      autoPlay
      loop
      style={{ width, height }}
    />
  )
}
