import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet, Linking, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { supabase } from '../services/supabase'

// Landing page early-access registration form.
const EARLY_ACCESS_URL = 'https://iskotify.ph/#early-access'

/**
 * early-access-required — full-screen blocking gate shown on web when a signed-in
 * user's account is not yet on the approved early-access list.
 *
 * Reached only via router.replace('/early-access-required') from _layout.tsx
 * web gate; safe and inert otherwise (the native branch never routes here).
 */
export default function EarlyAccessRequiredScreen() {
  const { theme: t, typo } = useTheme()

  const s = useMemo(() => StyleSheet.create({
    root:    { flex: 1, backgroundColor: t.bg },
    center:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    logo:    { width: 96, height: 96, marginBottom: spacing.xl },
    title:   { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', marginBottom: spacing.md, letterSpacing: -0.3 },
    body:    { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xxl },
    group:   { width: '100%', gap: spacing.md, maxWidth: 420 },
    primary: { backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    primaryTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
    secondary: { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    secondaryTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textSecondary },
  }), [t, typo])

  function handleRegister() {
    void Linking.openURL(EARLY_ACCESS_URL).catch(() => {
      if (typeof window !== 'undefined') window.open(EARLY_ACCESS_URL, '_blank')
    })
  }

  async function handleSwitchAccount() {
    await supabase.auth.signOut()
    router.replace('/auth/sign-in')
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
          Early access required
        </Text>
        <Text style={s.body} maxFontSizeMultiplier={1.4}>
          You're signed in, but your account isn't on the approved early-access list yet. Kung nag-register ka na, hintay lang — you'll get an email with the app link once you're approved. Hindi ka maiiwan, promise!
        </Text>
        <View style={s.group}>
          <Pressable
            onPress={handleRegister}
            accessibilityRole="button"
            accessibilityLabel="Register for early access"
            style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
          >
            <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>
              Register for early access
            </Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSwitchAccount()}
            accessibilityRole="button"
            accessibilityLabel="Use a different account"
            style={({ pressed }) => [s.secondary, pressed ? { opacity: 0.7 } : null]}
          >
            <Text style={s.secondaryTxt} maxFontSizeMultiplier={1.4}>
              Use a different account
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
