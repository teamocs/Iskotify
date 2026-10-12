import type { ReactNode, RefObject } from 'react'
import type { View, ViewProps, ViewStyle } from 'react-native'
import { glass, radius } from '../../theme/tokens'
import type { BlurTier, PlatformCapabilities } from '../../hooks/usePlatformCapabilities'

export type GlassVariant = 'bar' | 'button' | 'header'

export interface GlassProps extends ViewProps {
  /** bar: the floating tab capsule · button: a round header button · header: a full-width band. */
  variant?: GlassVariant
  /** Ask for a lower tier than the device offers (e.g. the dev demo). It can
   *  only step down; Reduce Transparency always wins. */
  tier?: BlurTier
  /** Android API 31+: ref to the BlurTargetView holding the content to blur.
   *  Without one, Android draws the opaque tier. */
  blurTarget?: RefObject<View | null>
  children?: ReactNode
}

const SHAPE: Record<GlassVariant, ViewStyle> = {
  bar:    { borderRadius: radius.capsule, overflow: 'hidden' },
  button: { borderRadius: radius.capsule, overflow: 'hidden' },
  header: { borderRadius: 0, overflow: 'hidden' },
}

export function glassShape(variant: GlassVariant = 'bar'): ViewStyle {
  return SHAPE[variant]
}

export const opaqueGlass: ViewStyle = { backgroundColor: glass.opaque }

/** The tier to draw: the device's, or a requested lower one. */
export function effectiveTier(caps: PlatformCapabilities, requested?: BlurTier): BlurTier {
  if (caps.reduceTransparency) return 'opaque'
  if (!requested || requested === caps.blurTier) return caps.blurTier
  if (requested === 'opaque') return 'opaque'
  if (requested === 'blur' && caps.blurTier === 'liquid') return 'blur'
  return caps.blurTier
}
