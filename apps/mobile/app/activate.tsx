import { useEffect, useMemo, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import * as ExpoLinking from 'expo-linking'
import { supabase } from '../services/supabase'
import { setEarlyAccessActivated } from '../utils/earlyAccessActivation'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'

const EARLY_ACCESS_URL = 'https://iskotify.ph/#early-access'

type Screen =
  | 'idle'       // initial — show "Sign in with Google" CTA
  | 'checking'   // sign-in or RPC in progress
  | 'not_approved' // signed in but not on the approved list
  | 'error'      // sign-in failure or RPC network error

/**
 * activate — native-only early-access activation gate.
 *
 * Shown on a fresh APK install (no local profile) when the SecureStore flag
 * is absent. The user must sign in with their approved early-access Google
 * account once; after that the flag is persisted and the gate never runs again
 * (fully offline-capable thereafter).
 *
 * Reached only via router.replace('/activate') from _layout.tsx native branch.
 * The web branch never routes here.
 */
export default function ActivateScreen() {
  const { theme: t, typo } = useTheme()
  const [screen, setScreen] = useState<Screen>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const s = useMemo(() => StyleSheet.create({
    root:         { flex: 1, backgroundColor: t.bg },
    center:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
    logo:         { width: 96, height: 96, marginBottom: spacing.xl },
    title:        { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', marginBottom: spacing.md, letterSpacing: -0.3 },
    body:         { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xxl },
    bodyError:    { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.danger, textAlign: 'center', lineHeight: 24, marginBottom: spacing.xxl },
    group:        { width: '100%', gap: spacing.md, maxWidth: 420 },
    primary:      { backgroundColor: t.accentStrong, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48, flexDirection: 'row', gap: spacing.sm },
    primaryTxt:   { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
    secondary:    { borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingVertical: 15, paddingHorizontal: spacing.xxl, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    secondaryTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textSecondary },
  }), [t, typo])

  /**
   * Runs the SAME native Google sign-in as landing.tsx:
   *   supabase.auth.signInWithOAuth → WebBrowser.openAuthSessionAsync → exchangeCodeForSession
   * After a session is established, calls the early_access_status RPC and
   * either activates + routes to /landing, shows the not-approved state, or
   * shows a retryable error state. Never navigates into the app on failure.
   */
  async function handleSignIn() {
    setScreen('checking')
    setErrorMessage('')
    try {
      const redirectUrl = ExpoLinking.createURL('auth/callback')

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      })

      if (error || !data.url) {
        setErrorMessage(error?.message ?? 'Could not start Google sign-in. Please try again.')
        setScreen('error')
        return
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl)

      if (result.type !== 'success') {
        // User cancelled the browser or it was dismissed — retryable, not an error
        setScreen('idle')
        return
      }

      // Exchange the PKCE code for a session (mirrors landing.tsx fallback handler)
      try {
        const parsed = new URL(result.url)
        const code = parsed.searchParams.get('code')
        if (code) {
          const { error: exchErr } = await supabase.auth.exchangeCodeForSession(code)
          if (exchErr) {
            // Code may have already been exchanged by auth/callback.tsx — check for session
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) {
              setErrorMessage('Sign-in failed. Please try again.')
              setScreen('error')
              return
            }
          }
        } else {
          // auth/callback.tsx already handled — session should exist
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            setErrorMessage('Sign-in could not be completed. Please try again.')
            setScreen('error')
            return
          }
        }
      } catch (exchEx) {
        console.warn('[activate] code exchange error:', exchEx)
        setErrorMessage('Sign-in could not be completed. Please try again.')
        setScreen('error')
        return
      }

      // Session established — check early_access_status RPC
      await checkRpcAndRoute()
    } catch (e) {
      console.error('[activate] sign-in error:', e)
      setErrorMessage('Something went wrong. Please check your connection and try again.')
      setScreen('error')
    }
  }

  /**
   * Calls the early_access_status RPC on an established session and routes
   * accordingly. Extracted so it can be used after sign-in and on retry.
   */
  async function checkRpcAndRoute() {
    try {
      const { data: status, error: rpcErr } = await supabase.rpc('early_access_status')
      if (rpcErr) {
        console.warn('[activate] RPC error:', rpcErr)
        setErrorMessage('Could not verify your access status. Please check your connection and try again.')
        setScreen('error')
        return
      }
      if (status === 'approved' || status === 'sent') {
        await setEarlyAccessActivated()
        router.replace('/landing')
      } else {
        // pending / expired / none — show registration prompt
        setScreen('not_approved')
      }
    } catch (e) {
      console.error('[activate] RPC network error:', e)
      setErrorMessage('Could not verify your access status. Please check your connection and try again.')
      setScreen('error')
    }
  }

  async function handleSwitchAccount() {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('[activate] signOut error (non-fatal):', e)
    }
    setScreen('idle')
    setErrorMessage('')
  }

  function handleRegister() {
    void Linking.openURL(EARLY_ACCESS_URL).catch(e => {
      console.warn('[activate] Linking.openURL error:', e)
    })
  }

  // If auth/callback.tsx established a session and deferred here (unapproved /
  // pending), verify approval right away so the user sees the correct state
  // instead of a stale "Sign in" button. Fresh installs have no session → stay idle.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!cancelled && session) {
          setScreen('checking')
          await checkRpcAndRoute()
        }
      } catch {
        /* no session → stay idle */
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Idle ──────────────────────────────────────────────────────────────────
  if (screen === 'idle') {
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
            Activate early access
          </Text>
          <Text style={s.body} maxFontSizeMultiplier={1.4}>
            Sign in with the Google account you used to register for early access. You only need to do this once — after that, the app works fully offline.
          </Text>
          <View style={s.group}>
            <Pressable
              onPress={() => void handleSignIn()}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>Sign in with Google</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Checking (sign-in / RPC in progress) ─────────────────────────────────
  if (screen === 'checking') {
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
            Activating…
          </Text>
          <ActivityIndicator
            size="large"
            color={t.accentStrong}
            accessibilityLabel="Verifying early access"
            style={{ marginBottom: spacing.xxl }}
          />
        </View>
      </SafeAreaView>
    )
  }

  // ── Not approved ──────────────────────────────────────────────────────────
  if (screen === 'not_approved') {
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
            Not on the list yet
          </Text>
          <Text style={s.body} maxFontSizeMultiplier={1.4}>
            You're not on the approved early-access list yet. Kung nag-register ka na, hintay lang — you'll get an email once you're approved. Hindi ka maiiwan, promise!
          </Text>
          <View style={s.group}>
            <Pressable
              onPress={handleRegister}
              accessibilityRole="button"
              accessibilityLabel="Register for early access"
              style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>Register for early access</Text>
            </Pressable>
            <Pressable
              onPress={() => void handleSwitchAccount()}
              accessibilityRole="button"
              accessibilityLabel="Use a different account"
              style={({ pressed }) => [s.secondary, pressed ? { opacity: 0.7 } : null]}
            >
              <Text style={s.secondaryTxt} maxFontSizeMultiplier={1.4}>Use a different account</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
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
          Something went wrong
        </Text>
        <Text style={s.bodyError} maxFontSizeMultiplier={1.4}>
          {errorMessage !== '' ? errorMessage : 'An unexpected error occurred. Please try again.'}
        </Text>
        <View style={s.group}>
          <Pressable
            onPress={() => void handleSignIn()}
            accessibilityRole="button"
            accessibilityLabel="Try again"
            style={({ pressed }) => [s.primary, pressed ? { opacity: 0.85 } : null]}
          >
            <Text style={s.primaryTxt} maxFontSizeMultiplier={1.4}>Try again</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}
