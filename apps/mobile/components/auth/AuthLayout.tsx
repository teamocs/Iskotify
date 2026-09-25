// RN Image is fine for the tiny bundled app icon.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { Image, Platform, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint, pagePadding } from '../../hooks/useBreakpoint'
import { heading } from '../ui/a11y'

export const TAGLINE = 'Para sa mga Iskolar ng Bayan'

// Native: keep the focused field and the submit button above the keyboard.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NativeKAV: React.ComponentType<{ behavior: 'padding'; style?: object; children: React.ReactNode }> | null =
  Platform.OS === 'web' ? null : require('react-native-keyboard-controller').KeyboardAvoidingView

/** App icon + wordmark (the page's h1) + the approved tagline. */
export function BrandBlock({ align = 'center' }: { align?: 'center' | 'start' }) {
  const { theme: t } = useTheme()
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
 * Auth page frame (sign-in, reset password, callback): a centred 440 column on
 * the themed ground, vertically centred when it fits, scrollable when the
 * keyboard or 200% text makes it tall. Taps on buttons land on the first try
 * while the keyboard is up (keyboardShouldPersistTaps).
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const body = (
    <ScrollView
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      <View style={{ width: '100%', maxWidth: 440, alignSelf: 'center', paddingHorizontal: pagePadding(bp) }}>
        {children}
      </View>
    </ScrollView>
  )
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
