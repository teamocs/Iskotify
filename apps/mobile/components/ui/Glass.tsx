import { View } from 'react-native'
import { glassShape, opaqueGlass, type GlassProps } from './glassShared'

export type { GlassProps, GlassVariant } from './glassShared'

/**
 * Glass chrome: the floating tab capsule, the collapsed large-title band and
 * round header buttons. Metro picks Glass.ios / Glass.android / Glass.web;
 * this file is the type entry and the opaque fallback for any other platform.
 *
 * Tiers (see hooks/usePlatformCapabilities): iOS 26 Liquid Glass when
 * `isLiquidGlassAvailable() && isGlassEffectAPIAvailable()`, else an iOS
 * BlurView (systemChromeMaterialLight); Android API 31+ Dimezis blur over a
 * `blurTarget`, else opaque; web a CSS recipe with a no-backdrop-filter
 * fallback. Reduce Transparency is opaque (#fdf4f4) everywhere.
 *
 * Rules:
 * - Chrome only. Never put <Glass> inside list cells: a blur per row costs a
 *   render pass each and drops frames on low-end Android.
 * - On Android, render <Glass> AFTER the dynamic content it floats over (a
 *   later sibling of the BlurTargetView, never inside it), so the blur
 *   samples finished content.
 * - Labels on glass use textPrimary when they can float over solid accent
 *   (glass.labelOverAccent); accentText measures ~2:1 there.
 */
export function Glass({ variant, tier: _tier, blurTarget: _blurTarget, style, children, ...rest }: GlassProps) {
  return (
    <View {...rest} style={[glassShape(variant), opaqueGlass, style]}>
      {children}
    </View>
  )
}
