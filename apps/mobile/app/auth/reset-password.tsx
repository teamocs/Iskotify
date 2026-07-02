/**
 * app/auth/reset-password.tsx — set a new password after a recovery link.
 *
 * Routed to from /auth/callback when the URL / PASSWORD_RECOVERY event marks
 * the visit as a Supabase password-recovery redirect (see utils/recoveryUrl.ts).
 * The recovery link has already signed the user in, so this screen only needs
 * supabase.auth.updateUser({ password }) via services/webAuth.updatePassword().
 *
 * Web-first (recovery emails redirect to the web origin) but safe to bundle and
 * render on native — RN primitives only, no window access.
 *
 * Mirrors the sign-in.tsx styling patterns: SafeAreaView + theme tokens +
 * Pressable submit with spinner, inline field errors, show/hide toggle,
 * accessibilityLabels, maxFontSizeMultiplier 1.4 on dense text.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
  StyleSheet,
  Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { supabase } from '../../services/supabase'
import { updatePassword, isValidPassword } from '../../services/webAuth'

// ── Field error label (same pattern as sign-in.tsx) ──────────────────────────

function FieldError({ message }: { message: string }) {
  if (!message) return null
  return (
    <Text
      style={{ color: '#dc2626', fontSize: 12, fontFamily: 'Lexend_400Regular', marginTop: 4 }}
      accessibilityRole="alert"
      maxFontSizeMultiplier={1.4}
    >
      {message}
    </Text>
  )
}

type Phase = 'checking' | 'form' | 'expired' | 'success'

// ── Main screen ───────────────────────────────────────────────────────────────

export default function ResetPasswordScreen() {
  const { theme: t, typo } = useTheme()

  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Field-level inline errors + general submit error
  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [formError, setFormError] = useState('')

  const passwordRef = useRef<TextInput>(null)
  const confirmRef = useRef<TextInput>(null)

  // The recovery link signs the user in before landing here. If there is no
  // session (direct visit / expired link), updateUser() can't work — show the
  // "link expired" panel instead of a form that always fails.
  useEffect(() => {
    let cancelled = false
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setPhase(session ? 'form' : 'expired')
      })
      .catch(() => {
        if (!cancelled) setPhase('expired')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    scroll:      { flexGrow: 1, justifyContent: 'center' },
    container:   { paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl, maxWidth: 440, alignSelf: 'center', width: '100%' },
    logo:        { width: 64, height: 64, borderRadius: radius.xl, alignSelf: 'center', marginBottom: spacing.lg },
    appName:     { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
    tagline:     { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
    label:       { fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: t.textPrimary, marginBottom: 6, marginTop: spacing.md },
    input:       {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: Platform.OS === 'web' ? spacing.md : spacing.md + 2,
      fontSize: typo.base,
      fontFamily: 'Lexend_400Regular',
      color: t.textPrimary,
      minHeight: 48,
    },
    inputError:  { borderColor: '#dc2626' },
    passwordRow: { position: 'relative' },
    eyeBtn:      { position: 'absolute', right: 12, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: spacing.xs, minWidth: 44, minHeight: 48 },
    eyeText:     { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    submitBtn:   {
      backgroundColor: t.accent,
      borderRadius: radius.lg,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: spacing.xl,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    submitText:  { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: '#ffffff' },
    formErrorBox:{ backgroundColor: 'rgba(220,38,38,0.10)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(220,38,38,0.25)', padding: spacing.md, marginTop: spacing.md },
    formErrorTxt:{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: '#dc2626' },
    successBox:  { backgroundColor: 'rgba(34,197,94,0.10)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', padding: spacing.lg, gap: spacing.sm },
    successTitle:{ fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.textPrimary },
    successText: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: 20 },
  })

  // ── Validation ──────────────────────────────────────────────────────────────

  function validateFields(): boolean {
    let valid = true
    setPasswordError('')
    setConfirmError('')
    setFormError('')

    if (!isValidPassword(password)) {
      setPasswordError('Password must be at least 8 characters.')
      valid = false
    }
    if (confirm !== password) {
      setConfirmError("Passwords don't match.")
      valid = false
    }
    return valid
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!validateFields()) return
    setLoading(true)
    setFormError('')
    try {
      const result = await updatePassword(password)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setPhase('success')
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [password, confirm])

  // ── Shared brand header ─────────────────────────────────────────────────────

  const brand = (
    <>
      <Image
        source={require('../../assets/images/icon.png')}
        style={s.logo}
        accessibilityLabel="Iskotify logo"
      />
      <Text style={s.appName} maxFontSizeMultiplier={1.4}>Iskotify</Text>
    </>
  )

  // ── Render: checking session ────────────────────────────────────────────────

  if (phase === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#831626" />
      </View>
    )
  }

  // ── Render: expired / no-session panel ──────────────────────────────────────

  if (phase === 'expired') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.container}>
            {brand}
            <View style={[s.formErrorBox, { marginTop: spacing.xl, padding: spacing.lg }]}>
              <Text style={[s.successTitle]} maxFontSizeMultiplier={1.4}>
                Reset link expired
              </Text>
              <Text style={[s.successText, { marginTop: spacing.xs }]} maxFontSizeMultiplier={1.4}>
                This password-reset link is no longer valid. Request a new one
                from the sign-in screen with "Forgot password?".
              </Text>
            </View>
            <Pressable
              onPress={() => router.replace('/auth/sign-in')}
              accessibilityRole="button"
              accessibilityLabel="Back to sign in"
              style={({ pressed }) => [s.submitBtn, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={s.submitText} maxFontSizeMultiplier={1.4}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Render: success panel ───────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.container}>
            {brand}
            <View style={[s.successBox, { marginTop: spacing.xl }]}>
              <Text style={s.successTitle} maxFontSizeMultiplier={1.4}>
                Password updated
              </Text>
              <Text style={s.successText} maxFontSizeMultiplier={1.4}>
                Your new password is set and you're signed in. Use it the next
                time you sign in to Iskotify.
              </Text>
            </View>
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              accessibilityRole="button"
              accessibilityLabel="Continue to Iskotify"
              style={({ pressed }) => [s.submitBtn, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={s.submitText} maxFontSizeMultiplier={1.4}>Continue to Iskotify</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Render: set-new-password form ───────────────────────────────────────────

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.container}>
          {brand}
          <Text style={s.tagline} maxFontSizeMultiplier={1.4}>
            Choose a new password for your account
          </Text>

          {/* New password field */}
          <Pressable accessibilityRole="none" onPress={() => passwordRef.current?.focus()}>
            <Text style={s.label} maxFontSizeMultiplier={1.4}>New password</Text>
          </Pressable>
          <View style={s.passwordRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => { setPassword(v); setPasswordError('') }}
              style={[s.input, { paddingRight: 56 }, passwordError ? s.inputError : null]}
              placeholder="At least 8 characters"
              placeholderTextColor={t.textTertiary}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="next"
              onSubmitEditing={() => confirmRef.current?.focus()}
              accessibilityLabel="New password"
              accessibilityHint="Choose a new password with at least 8 characters"
            />
            <Pressable
              onPress={() => setShowPassword(v => !v)}
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              style={({ pressed }) => [s.eyeBtn, pressed ? { opacity: 0.7 } : null]}
            >
              <Text style={s.eyeText} maxFontSizeMultiplier={1.4}>
                {showPassword ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
          <FieldError message={passwordError} />

          {/* Confirm password field */}
          <Pressable accessibilityRole="none" onPress={() => confirmRef.current?.focus()}>
            <Text style={s.label} maxFontSizeMultiplier={1.4}>Confirm new password</Text>
          </Pressable>
          <TextInput
            ref={confirmRef}
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setConfirmError('') }}
            style={[s.input, confirmError ? s.inputError : null]}
            placeholder="Repeat the new password"
            placeholderTextColor={t.textTertiary}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Confirm new password"
            accessibilityHint="Repeat the new password to confirm it"
          />
          <FieldError message={confirmError} />

          {/* General form error */}
          {formError ? (
            <View style={s.formErrorBox}>
              <Text style={s.formErrorTxt} accessibilityRole="alert" maxFontSizeMultiplier={1.4}>
                {formError}
              </Text>
            </View>
          ) : null}

          {/* Submit — disabled ONLY while loading (same pattern as sign-in) */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Set new password"
            accessibilityState={{ disabled: loading, busy: loading }}
            style={({ pressed }) => [
              s.submitBtn,
              loading ? { opacity: 0.7 } : null,
              pressed && !loading ? { opacity: 0.85 } : null,
            ]}
          >
            {loading ? <ActivityIndicator color="#ffffff" size="small" /> : null}
            <Text style={s.submitText} maxFontSizeMultiplier={1.4}>
              {loading ? 'Saving…' : 'Set new password'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
