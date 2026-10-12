import { View } from 'react-native'
import { GlassView } from 'expo-glass-effect'
import { BlurView } from 'expo-blur'
import { glass } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { effectiveTier, glassShape, opaqueGlass, type GlassProps } from './glassShared'

export type { GlassProps, GlassVariant } from './glassShared'

/** iOS <Glass>. Rules and tiers: see Glass.tsx. Never inside list cells. */
export function Glass({ variant, tier, blurTarget: _blurTarget, style, children, ...rest }: GlassProps) {
  const caps = usePlatformCapabilities()
  const drawn = effectiveTier(caps, tier)
  const shape = glassShape(variant)

  // Both availability checks are folded into caps.liquidGlass; re-check it
  // here so GlassView can never mount on a device without the API.
  if (drawn === 'liquid' && caps.liquidGlass) {
    return (
      <GlassView {...rest} glassEffectStyle="regular" colorScheme="light" style={[shape, style]}>
        {children}
      </GlassView>
    )
  }
  if (drawn === 'blur' || drawn === 'liquid') {
    return (
      <BlurView {...rest} tint={glass.iosMaterial} intensity={glass.iosIntensity} style={[shape, style]}>
        {children}
      </BlurView>
    )
  }
  return (
    <View {...rest} style={[shape, opaqueGlass, style]}>
      {children}
    </View>
  )
}
