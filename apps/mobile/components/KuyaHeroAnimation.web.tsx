// Web build of the hero mascot: a static PNG. lottie-react-native is deliberately
// NOT imported here — Metro bundles every require() statically, so importing it
// (even lazily) would pull its web entry's @lottiefiles/dotlottie-react peer into
// the web bundle and break `expo export -p web`. The native animation lives in
// KuyaHeroAnimation.tsx; Metro resolves THIS file for the web platform.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'

interface Props {
  width?: number
  height?: number
}

export function KuyaHeroAnimation({ width = 175, height = 149 }: Props) {
  return (
    <Image
      source={require('../assets/images/kuya-baw-wave.png')}
      style={{ width, height }}
      resizeMode="contain"
    />
  )
}
