/**
 * app/auth/sign-in.tsx — Web-first auth screen (email/password + Google).
 *
 * Routed to on web when no Supabase session exists (_layout web gate), so it
 * is the web build's first impression: brand, the approved tagline, and one
 * primary action. Safe to bundle on native, which never navigates here
 * (native uses landing.tsx + the Google OAuth flow).
 *
 * Forms: every field has a visible label that is also its accessible name,
 * the right autocomplete / textContentType for password managers, inline
 * errors that say how to fix the problem (announced, and aria-invalid on the
 * field), and a 44pt show/hide password toggle. Submit is disabled only while
 * the request runs and announces aria-busy.
 */
import { useState, useRef, useCallback, useEffect } from 'react'
import { View, TextInput, Platform, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GoogleOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { weight, radius, spacing } from '../../theme/tokens'
import { useGoogleOneTap } from '../../hooks/useGoogleOneTap'
import {
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  signInWithGoogleWeb,
  isValidEmail,
  isValidPassword,
} from '../../services/webAuth'
import { checkPwnedPassword, BREACHED_PASSWORD_MESSAGE } from '../../services/pwnedPasswords'
import { AuthHeroLayout, AuthSheet, StatusPanel } from '../../components/auth/AuthLayout'
import { Button } from '../../components/ui/Button'
import { InfoBanner } from '../../components/ui/InfoBanner'
import { takeAccountNotice } from '../../services/accountNotice'
import { TextField } from '../../components/ui/TextField'
import { LegalLine } from '../../components/consent/LegalLinks'
import { decorative, focusRing, heading } from '../../components/ui/a11y'
import { PressableScale } from '../../components/ui/Pressable'
import { SegmentedControl, type Segment } from '../../components/ui/SegmentedControl'
import { Text } from '../../components/ui/Text'
import { GUEST_INTRO_HREF } from '../../utils/guestPreview'

type Mode = 'sign-in' | 'sign-up'

// Why the student was sent back here (set by /auth/callback on failure).
// How long a successful sign-in waits for the web entry gate to open the app
// before the button comes back. Routing pulls the student's backup first, so
// it is given a generous window; past it, something failed or hung.
const ROUTING_TIMEOUT_MS = 8000
const ROUTING_STALLED =
  "You're signed in, but we couldn't open the app. Check your connection and try again."

const RETURN_REASONS: Record<string, string> = {
  link: "That sign-in link didn't work or has expired. Please sign in again.",
}

function Divider({ label }: { label: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View {...decorative} style={{ flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: t.divider }} />
      <Text role="footnote" color={t.textSecondary} chrome>{label}</Text>
      <View {...decorative} style={{ flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: t.divider }} />
    </View>
  )
}

/**
 * "Continue with Google" (canvas "Sign in"): a dark capsule, textPrimary
 * fill with white type (16.3:1), so the maroon Sign in stays the one primary.
 */
function GoogleButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const { theme: t } = useTheme()
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      aria-disabled={disabled}
      style={({ pressed, focused }) => [
        {
          minHeight: 52, borderRadius: radius.capsule, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          gap: spacing.sm, paddingHorizontal: spacing.xl, backgroundColor: t.textPrimary,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        focusRing(t.focusRing, focused),
      ]}
    >
      <View {...decorative}>
        <Lineicons icon={GoogleOutlined} size={18} color={t.textInverse} />
      </View>
      <Text role="headline" color={t.textInverse}>Continue with Google</Text>
    </PressableScale>
  )
}

const MODES: readonly Segment<Mode>[] = [
  { value: 'sign-in', label: 'Sign in' },
  { value: 'sign-up', label: 'Create account' },
]

export default function SignInScreen() {
  const { theme: t } = useTheme()
  const params = useLocalSearchParams<{ error?: string; mode?: string }>() ?? {}
  const returnReason = params.error ? RETURN_REASONS[params.error] ?? null : null
  // Set when the student has just deleted their account; shown once.
  const [notice] = useState(takeAccountNotice)

  // Activate Google One Tap when env var is set and no session exists.
  useGoogleOneTap()

  // ?mode=signup (the guest diagnostic's results) opens on the create-account form.
  const [mode, setMode] = useState<Mode>(() => (params.mode === 'signup' ? 'sign-up' : 'sign-in'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')

  const [signUpSuccess, setSignUpSuccess] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [sendingReset, setSendingReset] = useState(false)

  const passwordRef = useRef<TextInput>(null)

  // Bounded wait for the gate to route after a successful sign-in. Cleared
  // when the screen goes away (the gate routed), or on the next attempt. The
  // gate can route before signInWithEmail resolves, so nothing is armed once
  // the screen has unmounted.
  const mounted = useRef(true)
  const routingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearRoutingTimer = () => {
    if (routingTimer.current) clearTimeout(routingTimer.current)
    routingTimer.current = null
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearRoutingTimer() }
  }, [])

  function validateFields(): boolean {
    let valid = true
    setEmailError('')
    setPasswordError('')
    setFormError('')
    if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address.')
      valid = false
    }
    if (!isValidPassword(password)) {
      setPasswordError('Password must be at least 8 characters.')
      valid = false
    }
    return valid
  }

  const handleSubmit = useCallback(async () => {
    if (!validateFields()) return
    clearRoutingTimer()
    setLoading(true)
    setFormError('')
    // On success the web entry gate routes on the auth event, after pulling
    // the student's data. Until it does, the button stays busy: an idle
    // "Sign in" in that gap looked like nothing had happened. If routing never
    // happens, the wait is bounded: the button comes back with a retry message.
    let routing = false
    try {
      if (mode === 'sign-up') {
        // Leaked-password check (HIBP k-anonymity). Fails open: only a positive
        // "breached" answer blocks; an outage or error lets sign-up continue.
        const pwned = await checkPwnedPassword(password).catch(() => null)
        if (pwned?.breached) {
          setPasswordError(BREACHED_PASSWORD_MESSAGE)
          return
        }
        const result = await signUpWithEmail(email.trim(), password)
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        if (result.data.needsEmailConfirm) setSignUpSuccess(true)
        else routing = true
      } else {
        const result = await signInWithEmail(email.trim(), password)
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        routing = true
      }
    } finally {
      if (!routing) setLoading(false)
      else if (mounted.current) {
        routingTimer.current = setTimeout(() => {
          routingTimer.current = null
          setLoading(false)
          setFormError(ROUTING_STALLED)
        }, ROUTING_TIMEOUT_MS)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, email, password])

  const handleForgotPassword = useCallback(async () => {
    if (!isValidEmail(email)) {
      setEmailError('Enter your email above first, then tap Forgot password again.')
      return
    }
    setSendingReset(true)
    setResetSent(false)
    try {
      const result = await sendPasswordReset(email.trim())
      if (result.ok) setResetSent(true)
      else setFormError(result.error)
    } finally {
      setSendingReset(false)
    }
  }, [email])

  const handleGoogle = useCallback(async () => {
    setLoading(true)
    try {
      const result = await signInWithGoogleWeb()
      if (!result.ok) setFormError(result.error)
      // OAuth redirects the browser — nothing more to do here.
    } finally {
      setLoading(false)
    }
  }, [])

  function switchMode(next: Mode) {
    setMode(next)
    setEmailError('')
    setPasswordError('')
    setFormError('')
    setSignUpSuccess(false)
    setResetSent(false)
  }

  if (signUpSuccess) {
    return (
      <AuthHeroLayout>
        <AuthSheet testID="auth-sheet">
          <StatusPanel tone="success" title="Check your email">
            <Text role="subheadline" color={t.textSecondary}>
              We sent a confirmation link to{' '}
              <Text role="subheadline" style={weight('600')}>{email}</Text>.
              Open that link to activate your account, then come back here to sign in.
            </Text>
          </StatusPanel>
          <Button
            label="I've confirmed — sign in"
            onPress={() => { setSignUpSuccess(false); switchMode('sign-in') }}
            size="lg"
            shape="pill"
            fullWidth
          />
        </AuthSheet>
      </AuthHeroLayout>
    )
  }

  const isSignUp = mode === 'sign-up'

  return (
    <AuthHeroLayout>
      <AuthSheet testID="auth-sheet">
        {notice ? <InfoBanner tone="neutral" message={notice} /> : null}

        {returnReason ? (
          <Text role="subheadline" color={t.danger} accessibilityRole="alert" style={{ textAlign: 'center' }}>
            {returnReason}
          </Text>
        ) : null}

        <Text {...heading(2)} role="title3">
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>

        {/* Sign in or create an account: one form, two modes. */}
        <SegmentedControl
          segments={MODES}
          value={mode}
          onChange={switchMode}
          accessibilityLabel="Sign in or create an account"
        />

        {/* Google sign-in here is the browser OAuth redirect (signInWithGoogleWeb),
            which does nothing in the native app (owner decision 2026-10-13):
            native students reach this screen from "Suggest a date correction"
            and sign in with email, or with Google from the landing screen. */}
        {Platform.OS === 'web' ? (
          <>
            <GoogleButton onPress={() => void handleGoogle()} disabled={loading} />
            <Divider label="or with email" />
          </>
        ) : null}

        <TextField
          label="Email address"
          value={email}
          onChangeText={(v) => { setEmail(v); setEmailError('') }}
          error={emailError || undefined}
          placeholder="you@example.com"
          autoComplete="email"
          textContentType="emailAddress"
          inputMode="email"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={(v) => { setPassword(v); setPasswordError('') }}
          error={passwordError || undefined}
          hint={isSignUp ? 'At least 8 characters' : undefined}
          placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
          secureToggle
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          textContentType={isSignUp ? 'newPassword' : 'password'}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="go"
          onSubmitEditing={() => void handleSubmit()}
        />

        {!isSignUp ? (
          <View style={{ alignItems: 'flex-end', marginTop: -spacing.sm, gap: spacing.xs }}>
            <Button
              label={sendingReset ? 'Sending…' : 'Forgot?'}
              accessibilityLabel="Forgot password"
              variant="ghost"
              size="sm"
              onPress={() => void handleForgotPassword()}
              disabled={sendingReset}
              style={{ paddingHorizontal: spacing.sm, marginRight: -spacing.sm, alignSelf: 'flex-end' }}
            />
            {resetSent ? (
              <Text role="subheadline" color={t.success} accessibilityLiveRegion="polite" style={{ alignSelf: 'stretch' }}>
                Check your email for a reset link.
              </Text>
            ) : null}
          </View>
        ) : null}

        {formError ? (
          <StatusPanel tone="danger" title={formError === ROUTING_STALLED ? "Couldn't open the app" : isSignUp ? "Couldn't create your account" : "Couldn't sign you in"}>
            <Text role="subheadline" accessibilityRole="alert">
              {formError}
            </Text>
          </StatusPanel>
        ) : null}

        <Button
          label={loading ? (isSignUp ? 'Creating account…' : 'Signing in…') : (isSignUp ? 'Create account' : 'Sign in')}
          accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
          onPress={() => void handleSubmit()}
          loading={loading}
          size="lg"
          shape="pill"
          fullWidth
        />

        {/* The web glimpse (P4): iOS has no app yet, so a visitor can try the free
            diagnostic before making an account. Web only. */}
        {Platform.OS === 'web' ? (
          <Button
            label="Try a free diagnostic — no account needed"
            variant="ghost"
            onPress={() => router.push(GUEST_INTRO_HREF)}
            disabled={loading}
            fullWidth
          />
        ) : null}

        <LegalLine />
      </AuthSheet>
    </AuthHeroLayout>
  )
}
