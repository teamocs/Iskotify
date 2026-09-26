// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { heading } from '../ui/a11y'
import { BrandPanel, TAGLINE } from './BrandPanel'

export { TAGLINE }

// Native: keep the focused field and the submit button above the keyboard.
const NativeKAV: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

// Visually hidden, still read and still the page's h1 (the sr-only pattern).
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

/**
 * App icon + wordmark (the page's h1) + the approved tagline. On wide windows
 * the brand panel beside the form already shows all three, so here the h1
 * stays for screen readers only and the form's own heading leads visually.
 */
export function BrandBlock({ align = 'center' }: { align?: 'center' | 'start' }) {
  const { theme: t } = useTheme()
  if (useBreakpoint() === 'expanded') {
    return <Text {...heading(1)} style={SR_ONLY}>Iskotify</Text>
  }
  const center = align === 'center'
  return (
    <View style={{ alignItems: center ? 'center' : 'flex-start', gap: spacing.xs }}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: 64, height: 64, borderRadius: radius.xl, marginBottom: spacing.md }}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
      <Text {...heading(1)} style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>Iskotify</Text>
      <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={1.6}>{TAGLINE}</Text>
    </View>
  )
}

/**
 * Auth page frame (sign-in, reset password). Phones and tablets: a centred
 * 440 column on the themed ground, vertically centred when it fits,
 * scrollable when the keyboard or 200% text makes it tall. Wide windows
 * (desktop web, large tablets): the maroon brand panel on the left and the
 * form on the right, instead of a lone column on an empty field. Taps on
 * buttons land on the first try while the keyboard is up.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const wide = bp === 'expanded'
  const column = (
    <ScrollView
      style={wide ? { flex: 1 } : undefined}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: pagePadding(bp) }}>
        {children}
      </View>
    </ScrollView>
  )
  const body = wide ? (
    <View style={{ flex: 1, flexDirection: 'row', padding: spacing.lg, gap: spacing.lg }}>
      <View style={{ flex: 5, maxWidth: 720 }}><BrandPanel /></View>
      <View style={{ flex: 6 }}>{column}</View>
    </View>
  ) : column
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      {NativeKAV && Platform.OS !== 'web'
        ? <NativeKAV behavior="padding" style={{ flex: 1 }}>{body}</NativeKAV>
        : body}
    </SafeAreaView>
  )
}

/** A bordered status panel (success / problem) with a real heading. */
export function StatusPanel({ tone, title, children }: { tone: 'success' | 'danger'; title: string; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const bg = tone === 'success' ? t.successSurface : t.dangerSurface
  const border = tone === 'success' ? t.successBorder : t.dangerBorder
  return (
    <View
      style={{
        backgroundColor: bg, borderWidth: 1, borderColor: border, borderRadius: radius.lg,
        borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm,
      }}
    >
      <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)}>{title}</Text>
      {children}
    </View>
  )
}
