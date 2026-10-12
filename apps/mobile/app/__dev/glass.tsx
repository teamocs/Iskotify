import { useMemo, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { Redirect } from 'expo-router'
import { BlurTargetView } from 'expo-blur'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Glass } from '../../components/ui/Glass'
import { Text } from '../../components/ui/Text'
import { useTheme } from '../../theme/ThemeContext'
import { layout, radius, spacing } from '../../theme/tokens'
import { effectiveTier } from '../../components/ui/glassShared'
import { usePlatformCapabilities, type BlurTier } from '../../hooks/usePlatformCapabilities'

// Development-only demo of every <Glass> tier (iOS redesign P1a).
// expo-router makes every file under app/ a route (a leading `__` does not
// hide it), so this file ships; outside __DEV__ it renders nothing of the
// demo and redirects home. Open it at /__dev/glass in a dev build.

const TIERS: { tier: BlurTier; label: string }[] = [
  { tier: 'liquid', label: 'iOS 26 Liquid Glass' },
  { tier: 'blur', label: 'iOS blur, chrome material' },
  { tier: 'android-blur', label: 'Android 12+ blur' },
  { tier: 'css', label: 'Web backdrop-filter' },
  { tier: 'opaque', label: 'Opaque fallback' },
]

export default function GlassDemoRoute() {
  if (!__DEV__) return <Redirect href="/" />
  return <GlassDemo />
}

function GlassDemo() {
  const { theme: t } = useTheme()
  const caps = usePlatformCapabilities()
  return (
    <ScreenScroll>
      <Text role="largeTitle" accessibilityRole="header">Glass tiers</Text>
      <Text role="footnote" color={t.textSecondary} style={{ marginTop: spacing.xs, marginBottom: spacing.lg }}>
        This device: {caps.blurTier}. Liquid Glass {caps.liquidGlass ? 'available' : 'not available'}.
        Reduce Transparency {caps.reduceTransparency ? 'on' : 'off'}, Reduce Motion {caps.reduceMotion ? 'on' : 'off'}.
      </Text>
      {TIERS.map(({ tier, label }) => (
        <TierStage key={tier} tier={tier} label={label} drawn={effectiveTier(caps, tier)} />
      ))}
    </ScreenScroll>
  )
}

function TierStage({ tier, label, drawn }: { tier: BlurTier; label: string; drawn: BlurTier }) {
  const { theme: t } = useTheme()
  const target = useRef<View>(null)
  const s = useMemo(() => StyleSheet.create({
    stage: { height: 120, borderRadius: radius.card, borderCurve: 'continuous', overflow: 'hidden', marginBottom: spacing.lg, backgroundColor: t.surface },
    stripes: { ...StyleSheet.absoluteFillObject, flexDirection: 'row' },
    stripe: { flex: 1 },
    capsule: {
      position: 'absolute', left: layout.tabCapsule.inset, right: layout.tabCapsule.inset, top: 29,
      height: layout.tabCapsule.height, justifyContent: 'center', paddingHorizontal: spacing.xl,
    },
  }), [t])
  const stripes = [t.accent, t.surface, t.accentSurface, t.bg, t.accent, t.surface]

  return (
    <View style={s.stage}>
      <BlurTargetView ref={target} style={s.stripes}>
        {stripes.map((c, i) => <View key={i} style={[s.stripe, { backgroundColor: c }]} />)}
      </BlurTargetView>
      {/* After the content it blurs, as Android requires. */}
      <Glass variant="bar" tier={tier} blurTarget={target} style={s.capsule}>
        <Text role="headline" chrome>{`${tier} · ${label}`}</Text>
        {drawn !== tier && (
          <Text role="footnote" chrome>{`Not available here, draws ${drawn}`}</Text>
        )}
      </Glass>
    </View>
  )
}
