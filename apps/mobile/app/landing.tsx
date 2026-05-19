import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from '../services/supabase'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import LogoSvg from '../assets/images/logo.svg'

WebBrowser.maybeCompleteAuthSession()

export default function LandingScreen() {
  const db = useDb()
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

      if (result.type === 'success') {
        const parsed = new URL(result.url)
        const fragment = new URLSearchParams(parsed.hash.slice(1))
        const accessToken = fragment.get('access_token')
        const refreshToken = fragment.get('refresh_token')

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
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
          }
        }
        router.replace('/onboarding')
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
      <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 56, paddingBottom: 40 }}>

        {/* Hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {/* Logo */}
          <LogoSvg width={88} height={88} viewBox="0 0 2048 2048" style={{ marginBottom: 4, borderRadius: 24 }} />

          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 34, color: '#fff', textAlign: 'center', letterSpacing: -0.5 }}>
            Iskotify
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 14, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 22, maxWidth: 280 }}>
            Your AI-powered study companion for Philippine scholarships and entrance exams.
          </Text>

          {/* Feature pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            {['Flashcards', 'Progress Tracking', 'Weak Area Focus', 'Sync Across Devices'].map(f => (
              <View key={f} style={{ backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: 11, color: '#fca5a5' }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          {/* Google sync info */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 14, gap: 4 }}>
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 12, color: '#fff' }}>☁️  Back up with Google</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.50)', lineHeight: 16 }}>
              Sign in so your progress and settings are saved. Switch devices anytime and your data comes with you.
            </Text>
          </View>

          {/* Google sign-in button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            style={{
              backgroundColor: '#fff',
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
              <ActivityIndicator color="#1a1a2e" size="small" />
            ) : (
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, color: '#1a1a2e', letterSpacing: 0.1 }}>G</Text>
            )}
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: '#1a1a2e' }}>
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.40)' }}>
              Skip for now — set up later in Profile
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
}
