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
import { View, Text, TextInput, Pressable } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GoogleOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle } from '../../theme/tokens'
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
import { AuthLayout, BrandBlock, StatusPanel } from '../../components/auth/AuthLayout'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { focusRing, heading, type WebPressableState } from '../../components/ui/a11y'

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
      <View style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
      <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.6}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
    </View>
  )
}

export default function SignInScreen() {
  const { theme: t } = useTheme()
  const params = useLocalSearchParams<{ error?: string }>() ?? {}
  const returnReason = params.error ? RETURN_REASONS[params.error] ?? null : null

  // Activate Google One Tap when env var is set and no session exists.
  useGoogleOneTap()

  const [mode, setMode] = useState<Mode>('sign-in')
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
      <AuthLayout>
        <View style={{ gap: spacing.xl }}>
          <BrandBlock />
          <StatusPanel tone="success" title="Check your email">
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>
              We sent a confirmation link to{' '}
              <Text style={{ fontFamily: fonts.bodySemi, color: t.textPrimary }}>{email}</Text>.
              Open that link to activate your account, then come back here to sign in.
            </Text>
          </StatusPanel>
          <Button
            label="I've confirmed — sign in"
            onPress={() => { setSignUpSuccess(false); switchMode('sign-in') }}
            size="lg"
            fullWidth
          />
        </View>
      </AuthLayout>
    )
  }

  const isSignUp = mode === 'sign-up'

  return (
    <AuthLayout>
      <View style={{ gap: spacing.xl }}>
        <BrandBlock />

        {returnReason ? (
          <Text accessibilityRole="alert" style={[textStyle('bodySm', t.danger), { textAlign: 'center' }]}>
            {returnReason}
          </Text>
        ) : null}

        {/* Mode switch: a two-tab tablist. */}
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row', backgroundColor: t.surface2, borderRadius: radius.lg,
            borderCurve: 'continuous', padding: spacing.xs, gap: spacing.xs,
          }}
        >
          {(['sign-in', 'sign-up'] as Mode[]).map((m) => {
            const active = mode === m
            const label = m === 'sign-in' ? 'Sign in' : 'Create account'
            return (
              <Pressable
                key={m}
                accessibilityRole="tab"
                accessibilityLabel={label}
                aria-selected={active}
                onPress={() => switchMode(m)}
                style={(state) => {
                  const { pressed, hovered, focused } = state as WebPressableState
                  return [{
                    flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center',
                    borderRadius: radius.md, borderCurve: 'continuous',
                    backgroundColor: active ? t.surface : pressed || hovered ? t.surfaceSubtle : 'transparent',
                    boxShadow: active ? t.shadowSm : undefined,
                  }, focusRing(t.focusRing, focused)]
                }}
              >
                <Text
                  style={[textStyle('label', active ? t.textPrimary : t.textSecondary), { fontFamily: active ? fonts.bodySemi : fonts.bodyMedium }]}
                  maxFontSizeMultiplier={1.6}
                >
                  {label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={{ gap: spacing.lg }}>
          <Text {...heading(2)} style={textStyle('headline', t.textPrimary)}>
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </Text>
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
            <View style={{ alignItems: 'flex-start', marginTop: -spacing.sm }}>
              <Button
                label={sendingReset ? 'Sending…' : 'Forgot password?'}
                accessibilityLabel="Forgot password"
                variant="ghost"
                size="sm"
                onPress={() => void handleForgotPassword()}
                disabled={sendingReset}
                style={{ paddingHorizontal: spacing.sm, marginLeft: -spacing.sm }}
              />
              {resetSent ? (
                <Text accessibilityLiveRegion="polite" style={textStyle('bodySm', t.success)}>
                  Check your email for a reset link.
                </Text>
              ) : null}
            </View>
          ) : null}

          {formError ? (
            <StatusPanel tone="danger" title={formError === ROUTING_STALLED ? "Couldn't open the app" : isSignUp ? "Couldn't create your account" : "Couldn't sign you in"}>
              <Text accessibilityRole="alert" style={textStyle('bodySm', t.textPrimary)} maxFontSizeMultiplier={2}>
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
            fullWidth
          />
        </View>

        <Divider label="or" />

        <Button
          label="Continue with Google"
          variant="secondary"
          onPress={() => void handleGoogle()}
          disabled={loading}
          icon={<Lineicons icon={GoogleOutlined} size={18} color={t.accentText} />}
          size="lg"
          fullWidth
        />

        <Text style={[textStyle('caption', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
          By continuing you agree to use Iskotify for personal study purposes.
        </Text>
      </View>
    </AuthLayout>
  )
}
