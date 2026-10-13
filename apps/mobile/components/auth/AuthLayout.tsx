// RN Image is fine for the tiny bundled app icon.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image, Platform, ScrollView, Text, View, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../../theme/ThemeContext'
import { glass, radius, spacing, iosTextStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { usePlatformCapabilities } from '../../hooks/usePlatformCapabilities'
import { Glass } from '../ui/Glass'
import { decorative, heading } from '../ui/a11y'
import { BrandPanel, TAGLINE } from './BrandPanel'

export { TAGLINE }

// Native: keep the focused field and the submit button above the keyboard.
const NativeKAV: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- native-only module; a static import would pull it into the web bundle
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

// Visually hidden, still read and still the page's h1 (the sr-only pattern).
const SR_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const

/** The current app logo (the pixel-art carabao, never redrawn). */
function AppIcon({ size, onMaroon }: { size: number; onMaroon?: boolean }) {
  const { theme: t } = useTheme()
  const corner = Math.round(size * 0.22)
  return (
    <View style={{ width: size, height: size, borderRadius: corner, boxShadow: onMaroon ? t.shadowMd : undefined }}>
      <Image
        source={require('../../assets/images/icon.png')}
        style={{ width: size, height: size, borderRadius: corner }}
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  )
}

/**
 * App icon + wordmark (the page's h1) + the approved tagline. On wide windows
 * the brand panel beside the form already shows all three, so here the h1
 * stays for screen readers only and the form's own heading leads visually.
 * `onMaroon`: the sign-in hero, white type on the maroon ground (10.95:1).
 */
export function BrandBlock({ align = 'center', onMaroon }: { align?: 'center' | 'start'; onMaroon?: boolean }) {
  const { theme: t } = useTheme()
  if (useBreakpoint() === 'expanded') {
    return <Text {...heading(1)} style={SR_ONLY}>Iskotify</Text>
  }
  const center = align === 'center'
  const ink = onMaroon ? t.textInverse : t.textPrimary
  return (
    <View style={{ alignItems: center ? 'center' : 'flex-start', gap: spacing.xs }}>
      <View style={{ marginBottom: spacing.md }}><AppIcon size={64} onMaroon={onMaroon} /></View>
      <Text {...heading(1)} style={iosTextStyle('largeTitle', ink)} maxFontSizeMultiplier={1.6}>Iskotify</Text>
      <Text style={iosTextStyle('headline', onMaroon ? t.textInverse : t.accentText)} maxFontSizeMultiplier={1.6}>{TAGLINE}</Text>
    </View>
  )
}

/**
 * Auth page frame (reset password, the plain form pages). Phones and
 * tablets: a centred 440 column on the themed ground, vertically centred when
 * it fits, scrollable when the keyboard or 200% text makes it tall. Wide
 * windows (desktop web, large tablets): the maroon brand panel on the left
 * and the form on the right, instead of a lone column on an empty field.
 * Taps on buttons land on the first try while the keyboard is up.
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
      <KeyboardShell>{body}</KeyboardShell>
    </SafeAreaView>
  )
}

function KeyboardShell({ children }: { children: React.ReactNode }) {
  return NativeKAV && Platform.OS !== 'web'
    ? <NativeKAV behavior="padding" style={{ flex: 1 }}>{children}</NativeKAV>
    : <>{children}</>
}

/**
 * The hero's soft shapes (canvas "Sign in"): three overlapping discs in the
 * maroon family behind the brand. Decorative, drawn with tokens.
 */
function HeroShapes() {
  const { theme: t } = useTheme()
  const disc = (size: number, color: string, at: ViewStyle, opacity = 1): ViewStyle => ({
    position: 'absolute', width: size, height: size, borderRadius: radius.capsule, backgroundColor: color, opacity, ...at,
  })
  return (
    <View {...decorative} pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <View style={disc(340, t.accentPressed, { top: -90, right: -110 })} />
      <View style={disc(280, t.accentText, { top: 240, left: -100 })} />
      <View style={disc(120, t.warning, { top: 200, left: 160 }, 0.6)} />
    </View>
  )
}

/**
 * The frosted sheet the sign-in form sits on (canvas "Sign in"): the 36pt
 * hero-sheet radius, the page ground at 80% with a backdrop blur on web, the
 * iOS system light material on iOS, opaque under Reduce Transparency and on
 * Android (no blur target over a static hero). Labels on it measure ≥4.5:1
 * over the darkest hero shape (glass.sheetFill, tokens.test).
 */
export function AuthSheet({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { theme: t } = useTheme()
  const { reduceTransparency } = usePlatformCapabilities()
  const wide = useBreakpoint() === 'expanded'
  const shape: ViewStyle = {
    borderRadius: radius.heroSheet, borderCurve: 'continuous', overflow: 'hidden',
    paddingHorizontal: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl + spacing.xs, gap: spacing.md,
  }
  if (wide) {
    // Beside the brand panel the sheet sits on the plain ground: a raised card.
    return <View testID={testID} style={[shape, { backgroundColor: t.surfaceRaised, boxShadow: t.shadowMd }]}>{children}</View>
  }
  const webFrost = Platform.OS === 'web' && !reduceTransparency
    ? ({ backgroundColor: glass.sheetFill, backdropFilter: glass.sheetBackdropFilter, WebkitBackdropFilter: glass.sheetBackdropFilter } as unknown as ViewStyle)
    : null
  return (
    <Glass
      testID={testID}
      variant="header"
      tier={Platform.OS === 'ios' ? 'blur' : Platform.OS === 'web' ? undefined : 'opaque'}
      style={[shape, webFrost]}
    >
      {children}
    </Glass>
  )
}

/**
 * The sign-in frame (canvas "Sign in"). Phones and tablets: a maroon ground
 * with soft shapes, the app logo, wordmark and tagline in white, and the form
 * on a frosted bottom sheet (AuthSheet). Wide windows: the maroon brand panel
 * beside the form, as on the other auth pages.
 */
export function AuthHeroLayout({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  if (bp === 'expanded') {
    return <AuthLayout>{children}</AuthLayout>
  }
  const gutter = spacing.md
  return (
    <SafeAreaView testID="auth-hero" style={{ flex: 1, backgroundColor: t.accent }}>
      {/* Light status-bar icons over the maroon hero (the app default is dark). */}
      <StatusBar style="light" />
      <KeyboardShell>
        <View style={{ flex: 1 }}>
          <HeroShapes />
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', gap: spacing.xxxl, paddingBottom: gutter }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: spacing.xxl + spacing.xs, paddingTop: spacing.xxxl * 2 }}>
              <BrandBlock align="start" onMaroon />
            </View>
            <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', paddingHorizontal: gutter }}>
              {children}
            </View>
          </ScrollView>
        </View>
      </KeyboardShell>
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
        backgroundColor: bg, borderWidth: 1, borderColor: border, borderRadius: radius.field,
        borderCurve: 'continuous', padding: spacing.lg, gap: spacing.sm,
      }}
    >
      <Text {...heading(2)} style={iosTextStyle('headline', t.textPrimary)}>{title}</Text>
      {children}
    </View>
  )
}
