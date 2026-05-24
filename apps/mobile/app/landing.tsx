import { useState } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '../services/supabase'
import { pullUserData } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'

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
                await pullUserData(db)
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
      <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 56, paddingBottom: 40 }}>

        {/* Hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {/* Logo */}
          <Image
            source={require('../assets/images/icon.png')}
            style={{ width: 88, height: 88, borderRadius: 24, marginBottom: 4 }}
          />

          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h1, color: t.textPrimary, textAlign: 'center', letterSpacing: -0.5 }}>
            Iskotify
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.base, color: t.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 }}>
            Your AI-powered study companion for Philippine scholarships and entrance exams.
          </Text>

          {/* Feature pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            {['Flashcards', 'Progress Tracking', 'Weak Area Focus', 'Sync Across Devices'].map(f => (
              <View key={f} style={{ backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.xs, color: t.accentText }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          {/* Google sync info */}
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, gap: 4 }}>
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.textPrimary }}>☁️  Back up with Google</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: 16 }}>
              Sign in so your progress and settings are saved. Switch devices anytime and your data comes with you.
            </Text>
          </View>

          {/* Google sign-in button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            style={{
              backgroundColor: t.textPrimary,
              borderRadius: 16,
              paddingVertical: 15,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: signingIn ? 0.7 : 1,
            }}
          >
            {signingIn ? (
              <ActivityIndicator color={t.bg} size="small" />
            ) : (
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.bg, letterSpacing: 0.1 }}>G</Text>
            )}
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.bg }}>
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary }}>
              Skip for now — set up later in Profile
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}
