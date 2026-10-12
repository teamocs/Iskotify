import { View, type ViewStyle } from 'react-native'
import { glass } from '../../theme/tokens'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { effectiveTier, glassShape, opaqueGlass, type GlassProps } from './glassShared'

export type { GlassProps, GlassVariant } from './glassShared'

// The canvas recipe. react-native-web passes these through to CSS; RN's
// ViewStyle has no backdropFilter key, hence the cast.
const cssGlass = {
  backgroundColor: glass.fill,
  backdropFilter: glass.backdropFilter,
  WebkitBackdropFilter: glass.backdropFilter,
  boxShadow: glass.webShadow,
} as unknown as ViewStyle

/**
 * Web <Glass>. Rules and tiers: see Glass.tsx. Inline styles cannot carry
 * `@supports`, so the same test runs once in JS (CSS.supports, in
 * usePlatformCapabilities): no backdrop-filter, or prefers-reduced-transparency,
 * draws the opaque tier.
 */
export function Glass({ variant, tier, blurTarget: _blurTarget, style, children, ...rest }: GlassProps) {
  const caps = usePlatformCapabilities()
  const fill = effectiveTier(caps, tier) === 'css' ? cssGlass : opaqueGlass
  return (
    <View {...rest} style={[glassShape(variant), fill, style]}>
      {children}
    </View>
  )
}
