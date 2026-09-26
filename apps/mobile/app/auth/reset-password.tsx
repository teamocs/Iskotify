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
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { View, Text, TextInput, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { supabase } from '../../services/supabase'
import { updatePassword, isValidPassword } from '../../services/webAuth'
import { checkPwnedPassword, BREACHED_PASSWORD_MESSAGE } from '../../services/pwnedPasswords'
import { AuthLayout, BrandBlock, StatusPanel } from '../../components/auth/AuthLayout'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { heading } from '../../components/ui/a11y'

type Phase = 'checking' | 'form' | 'expired' | 'success'

export default function ResetPasswordScreen() {
  const { theme: t } = useTheme()

  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  // One toggle reveals both fields, so the student can compare them.
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(false)

  const [passwordError, setPasswordError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [formError, setFormError] = useState('')

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

  function validateFields(): boolean {
    let valid = true
    setPasswordError('')
    setConfirmError('')
    setFormError('')
    if (!isValidPassword(password)) {
      setPasswordError('Use at least 8 characters.')
      valid = false
    }
    if (confirm !== password) {
      setConfirmError("These passwords don't match. Type the same password in both fields.")
      valid = false
    }
    return valid
  }

  const handleSubmit = useCallback(async () => {
    if (!validateFields()) return
    setLoading(true)
    setFormError('')
    try {
      // Leaked-password check (HIBP k-anonymity). Fails open: only a positive
      // "breached" answer blocks; an outage or error lets the reset continue.
      const pwned = await checkPwnedPassword(password).catch(() => null)
      if (pwned?.breached) {
        setPasswordError(BREACHED_PASSWORD_MESSAGE)
        return
      }
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

  if (phase === 'checking') {
    return (
      <AuthLayout>
        <View style={{ alignItems: 'center', gap: spacing.lg }}>
          <ActivityIndicator size="large" color={t.accentText} />
          <Text accessibilityLiveRegion="polite" style={textStyle('body', t.textSecondary)}>
            Checking your reset link…
          </Text>
        </View>
      </AuthLayout>
    )
  }

  if (phase === 'expired') {
    return (
      <AuthLayout>
        <View style={{ gap: spacing.xl }}>
          <BrandBlock />
          <View style={{ gap: spacing.sm }}>
            <Text {...heading(2)} style={textStyle('headline', t.textPrimary)}>This reset link has expired</Text>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
              Reset links work once and only for a short time. Go back to sign in and tap
              “Forgot password?” to get a new one.
            </Text>
          </View>
          <Button label="Back to sign in" onPress={() => router.replace('/auth/sign-in')} size="lg" fullWidth />
        </View>
      </AuthLayout>
    )
  }

  if (phase === 'success') {
    return (
      <AuthLayout>
        <View style={{ gap: spacing.xl }}>
          <BrandBlock />
          <StatusPanel tone="success" title="Password updated">
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
              Your new password is set and you&apos;re signed in. Use it the next time you sign in to Iskotify.
            </Text>
          </StatusPanel>
          <Button label="Continue to Iskotify" onPress={() => router.replace('/(tabs)')} size="lg" fullWidth />
        </View>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <View style={{ gap: spacing.xl }}>
        <BrandBlock />
        <View style={{ gap: spacing.lg }}>
          <Text {...heading(2)} style={textStyle('headline', t.textPrimary)}>Choose a new password</Text>
          <TextField
            label="New password"
            value={password}
            onChangeText={(v) => { setPassword(v); setPasswordError('') }}
            error={passwordError || undefined}
            hint="At least 8 characters"
            placeholder="At least 8 characters"
            secureToggle
            revealed={revealed}
            onRevealChange={setRevealed}
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="next"
            onSubmitEditing={() => confirmRef.current?.focus()}
          />
          <TextField
            ref={confirmRef}
            label="Confirm new password"
            value={confirm}
            onChangeText={(v) => { setConfirm(v); setConfirmError('') }}
            error={confirmError || undefined}
            placeholder="Type it again"
            // Follows the toggle on the first field (no second toggle).
            secureTextEntry={!revealed}
            autoComplete="new-password"
            textContentType="newPassword"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="go"
            onSubmitEditing={() => void handleSubmit()}
          />

          {formError ? (
            <StatusPanel tone="danger" title="Couldn't update your password">
              <Text accessibilityRole="alert" style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={2}>
                {formError}
              </Text>
            </StatusPanel>
          ) : null}

          <Button
            label={loading ? 'Saving…' : 'Set new password'}
            accessibilityLabel="Set new password"
            onPress={() => void handleSubmit()}
            loading={loading}
            size="lg"
            fullWidth
          />
        </View>
      </View>
    </AuthLayout>
  )
}
