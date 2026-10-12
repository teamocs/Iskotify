import { View } from 'react-native'
import { BlurView } from 'expo-blur'
import { glass } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { effectiveTier, glassShape, opaqueGlass, type GlassProps } from './glassShared'

export type { GlassProps, GlassVariant } from './glassShared'

/**
 * Android <Glass>. Rules and tiers: see Glass.tsx.
 * Blur only on API 31+ AND with a `blurTarget` (a ref to the BlurTargetView
 * wrapping the scrolling content). Render this AFTER that content, as a later
 * sibling, never inside it and never inside list cells. Intensity is fixed:
 * animating it re-renders the blur every frame.
 */
export function Glass({ variant, tier, blurTarget, style, children, ...rest }: GlassProps) {
  const caps = usePlatformCapabilities()
  const shape = glassShape(variant)

  // Without a target expo-blur falls back to a translucent "none" view, whose
  // label contrast is unmeasured; draw the opaque tier instead.
  if (effectiveTier(caps, tier) === 'android-blur' && blurTarget) {
    return (
      <BlurView
        {...rest}
        blurTarget={blurTarget}
        blurMethod={glass.androidBlurMethod}
        tint={glass.androidTint}
        intensity={glass.androidIntensity}
        blurReductionFactor={glass.androidBlurReductionFactor}
        style={[shape, style]}
      >
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
