import { useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, Platform, Alert, Linking, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { useDb } from '../hooks/useDb'
import { exportUserData } from '../services/export'

// Landing page early-access registration (web "get the app" target).
const LANDING_URL = 'https://iskotify.ph/#early-access'

/**
 * expired — full-screen blocking gate shown once the early-access build has
 * expired (see utils/earlyAccess.ts). There is no way to dismiss into the app;
 * the route is reached only via router.replace('/expired') from _layout.tsx.
 *
 * Native: nudges the user to export or Google-sync their data (reusing the
 *   export + sign-in entry points from app/(tabs)/profile.tsx).
 * Web: points them to the Android app via the landing page.
 */
export default function ExpiredScreen() {
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const isWeb = Platform.OS === 'web'
  const [exporting, setExporting] = useState(false)

  const s = useMemo(() => StyleSheet.create({
    root:    { flex: 1, backgroundColor: t.bg },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    icon:    { fontSize: 56, marginBottom: spacing.xl, textAlign: 'center' },
    logo:    { width: 96, height: 96, marginBottom: spacing.xl },
    title:   { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', marginBottom: spacing.md, letterSpacing: -0.3 },
    body:    { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xxl },
    group:   { width: '100%', gap: spacing.md, maxWidth: 420 },
    primary: { backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    primaryTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
    secondary: { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    secondaryTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textSecondary },
  }), [t, typo])

  async function handleExport() {
    if (exporting) return
    setExporting(true)
    try {
      const result = await exportUserData(db)
      if (result.status === 'saved' && !isWeb) {
        Alert.alert('Export Complete', `Saved as ${result.filename}`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not export data. Please try again.'
      if (isWeb) {
        if (typeof window !== 'undefined') window.alert(`Export Failed\n\n${msg}`)
      } else {
        Alert.alert('Export Failed', msg)
      }
    } finally {
      setExporting(false)
    }
  }

  // Reuse the existing Google sign-in / sync entry point. On native this is the
  // /landing screen (the Google sign-in flow); matches profile.tsx's signInRoute.
  function handleSignIn() {
    router.replace('/landing')
  }

  function handleGetApp() {
    void Linking.openURL(LANDING_URL).catch(() => {
      if (isWeb && typeof window !== 'undefined') window.open(LANDING_URL, '_blank')
    })
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.center}>
        <Image
          source={require('../assets/images/kuya-baw-logo.png')}
          style={s.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <Text style={s.title} maxFontSizeMultiplier={1.4}>
          Early access has ended
        </Text>

        {isWeb ? (
          <>
            <Text style={s.body} maxFontSizeMultiplier={1.4}>
              Your free early-access trial has ended. Get the Android app to keep going.
            </Text>
            <View style={s.group}>
              <Pressable
                onPress={handleGetApp}
                accessibilityRole="button"
                accessibilityLabel="Get the Android app"
                style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
              >
                <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>Get the Android app</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleExport()}
                disabled={exporting}
                accessibilityRole="button"
                accessibilityLabel="Export my data"
                style={({ pressed }) => [s.secondary, pressed ? { opacity: 0.7 } : null, exporting ? { opacity: 0.5 } : null]}
              >
                <Text style={s.secondaryTxt} maxFontSizeMultiplier={1.4}>
                  {exporting ? 'Exporting…' : 'Export my data'}
                </Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={s.body} maxFontSizeMultiplier={1.4}>
              This early-access build expired on August 2, 2026. To keep your progress,
              export your data or sign in with Google to sync it across devices before
              updating to the full app.
            </Text>
            <View style={s.group}>
              <Pressable
                onPress={() => void handleExport()}
                disabled={exporting}
                accessibilityRole="button"
                accessibilityLabel="Export my data"
                style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null, exporting ? { opacity: 0.6 } : null]}
              >
                <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>
                  {exporting ? 'Exporting…' : 'Export my data'}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSignIn}
                accessibilityRole="button"
                accessibilityLabel="Sign in or sync with Google"
                style={({ pressed }) => [s.secondary, pressed ? { opacity: 0.7 } : null]}
              >
                <Text style={s.secondaryTxt} maxFontSizeMultiplier={1.4}>Sign in / Sync with Google</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SafeAreaView>
  )
}
