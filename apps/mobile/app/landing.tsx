import { useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { View, Text, Pressable, ActivityIndicator, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '../services/supabase'
import { pullUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { eq } from 'drizzle-orm'
import { userSettings, focusListings } from '../db/schema'
import { hasOnboardingFocus } from '../utils/onboardingStatus'
import { spacing, radius } from '../theme/tokens'
import { Card } from '../components/ui/Card'

export default function LandingScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [signingIn, setSigningIn] = useState(false)

  async function handleGoogleSignIn() {
    setSigningIn(true)
    try {
      const redirectUrl = Linking.createURL('auth/callback')

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (error || !data.url) {
        Alert.alert('Sign-in failed', error?.message ?? 'Could not start Google sign-in.')
        return
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      // app/auth/callback.tsx is the PRIMARY handler (handles when Android routes
      // the deep link through Expo Router). This block is a FALLBACK for when
      // openAuthSessionAsync intercepts the redirect before Expo Router does.
      if (result.type === 'success') {
        try {
          const parsed = new URL(result.url)
          const code = parsed.searchParams.get('code')
          if (code) {
            const { error } = await supabase.auth.exchangeCodeForSession(code)
            // If error, callback.tsx may have already exchanged this code — check session
            const { data: { session } } = await supabase.auth.getSession()
            if (!error || session) {
              const { data: { user } } = await supabase.auth.getUser()
              if (user) {
                await db.insert(userSettings)
                  .values({
                    id: 1,
                    googleId: user.id,
                    email: user.email ?? '',
                    fullName: user.user_metadata?.full_name ?? '',
                    selectedListingSlug: '',
                    lastSyncedAt: 0,
                  })
                  .onConflictDoUpdate({
                    target: userSettings.id,
                    set: {
                      googleId: user.id,
                      email: user.email ?? '',
                      fullName: user.user_metadata?.full_name ?? '',
                    },
                  })
                // Non-fatal: don't let a data-restore failure abort sign-in.
                try {
                  await pullUserData(db)
                } catch (restoreErr) {
                  console.warn('[landing] data restore failed (non-fatal):', restoreErr)
                }

                // Mirror callback.tsx logic: skip onboarding for returning users
                const [settingsRows, focusRows] = await Promise.all([
                  db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
                  db.select().from(focusListings).limit(1),
                ])
                const hasProfile = !!(settingsRows[0]?.fullName?.trim())
                // Treat any chosen exam/scholarship as onboarded (matches _layout.tsx).
                const hasFocus = hasOnboardingFocus({
                  selectedListingSlug: settingsRows[0]?.selectedListingSlug,
                  focusCount: focusRows.length,
                  targetExams: settingsRows[0]?.targetExams,
                })

                if (hasProfile && hasFocus) {
                  router.replace('/(tabs)')  // returning user — data fully restored
                  return
                }
              }
              router.replace('/onboarding')
            }
          }
          // No code in URL → app/auth/callback.tsx already handled the deep link
        } catch {
          // callback.tsx is handling navigation; swallow errors here
        }
      }
    } catch (e) {
      console.error('[landing] google sign-in error:', e)
      Alert.alert('Sign-in failed', 'Something went wrong. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  function handleSkip() {
    router.replace('/onboarding')
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, paddingHorizontal: spacing.xxl, justifyContent: 'space-between', paddingTop: spacing.xxxl + spacing.xxl, paddingBottom: spacing.xxxl }}>

        {/* Hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg }}>
          {/* Logo */}
          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 88, height: 88, borderRadius: radius.xxl, marginBottom: spacing.xs }}
          />

          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h1, color: t.textPrimary, textAlign: 'center', letterSpacing: -0.5 }}>
            Iskotify
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.base, color: t.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 }}>
            Your AI-powered study companion for Philippine scholarships and entrance exams.
          </Text>

          {/* Feature pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center', marginTop: spacing.sm }}>
            {['Flashcards', 'Progress Tracking', 'Weak Area Focus', 'Sync Across Devices'].map(f => (
              <View key={f} style={{ backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}>
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.xs, color: t.accentText }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: spacing.md }}>
          {/* Google sync info */}
          <Card style={{ gap: spacing.xs, padding: spacing.lg }}>
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.textPrimary }}>☁️  Back up with Google</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: 18 }}>
              Sign in so your progress and settings are saved. Switch devices anytime and your data comes with you.
            </Text>
          </Card>

          {/* Google sign-in button */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            accessibilityRole="button"
            accessibilityState={{ disabled: signingIn, busy: signingIn }}
            style={({ pressed }) => [
              {
                backgroundColor: t.textPrimary,
                borderRadius: radius.lg,
                borderCurve: 'continuous',
                minHeight: 48,
                paddingVertical: spacing.md + 3,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: spacing.sm,
                boxShadow: t.shadowSm,
                opacity: signingIn ? 0.7 : 1,
              },
              pressed && !signingIn ? { opacity: 0.85 } : null,
            ]}
          >
            {signingIn ? (
              <ActivityIndicator color={t.bg} size="small" />
            ) : (
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.bg, letterSpacing: 0.1 }}>G</Text>
            )}
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.bg }}>
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </Pressable>

          {/* Skip */}
          <Pressable
            onPress={handleSkip}
            accessibilityRole="button"
            style={({ pressed }) => [
              { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: spacing.sm },
              pressed ? { opacity: 0.6 } : null,
            ]}
          >
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>
              Skip for now — set up later in Profile
            </Text>
          </Pressable>
        </View>

      </View>
    </SafeAreaView>
  )
}
