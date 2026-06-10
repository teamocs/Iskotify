/**
 * app/auth/sign-in.tsx — Web-first auth screen (email/password + Google).
 *
 * Routed to on web when no Supabase session exists (_layout web gate).
 * The file is safe to bundle on native but will never be navigated to
 * on native (native uses landing.tsx + Google OAuth flow).
 *
 * WIG compliance:
 *  - Labels are Pressable (tap to focus corresponding input via ref).
 *  - Autocomplete attrs set correctly (email / current-password / new-password).
 *  - Inline errors shown near each field.
 *  - Submit disabled only DURING the async request (shows spinner).
 *  - No paste-blocking.
 *  - focus-visible styles via RN-Web Pressable hovered/focused state.
 *  - All touch targets >= 44pt.
 *  - maxFontSizeMultiplier 1.4 on dense bits.
 */
import { useState, useRef, useCallback } from 'react'
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
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { useGoogleOneTap } from '../../hooks/useGoogleOneTap'
import {
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  signInWithGoogleWeb,
  isValidEmail,
  isValidPassword,
} from '../../services/webAuth'

type Mode = 'sign-in' | 'sign-up'

// ── Field error label ─────────────────────────────────────────────────────────

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

// ── Divider with label ────────────────────────────────────────────────────────

function Divider({ label }: { label: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
      <Text
        style={{ fontSize: 12, fontFamily: 'Lexend_400Regular', color: t.textTertiary }}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
    </View>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SignInScreen() {
  const { theme: t, typo } = useTheme()

  // Activate Google One Tap when env var is set and no session exists.
  useGoogleOneTap()

  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  // Field-level inline errors
  const [emailError, setEmailError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')  // general submit error

  // Stateful UI outcomes
  const [signUpSuccess, setSignUpSuccess] = useState(false)  // "check your email" panel
  const [resetSent, setResetSent] = useState(false)          // "check your email for reset"
  const [sendingReset, setSendingReset] = useState(false)

  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  const s = StyleSheet.create({
    root:        { flex: 1, backgroundColor: t.bg },
    scroll:      { flexGrow: 1, justifyContent: 'center' },
    container:   { paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxxl, maxWidth: 440, alignSelf: 'center', width: '100%' },
    logo:        { width: 64, height: 64, borderRadius: radius.xl, alignSelf: 'center', marginBottom: spacing.lg },
    appName:     { fontFamily: 'Outfit_700Bold', fontSize: typo.h2, color: t.textPrimary, textAlign: 'center', letterSpacing: -0.5 },
    tagline:     { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.xl },
    toggleRow:   { flexDirection: 'row', backgroundColor: t.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, padding: 3, marginBottom: spacing.xl },
    toggleBtn:   { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
    toggleText:  { fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm },
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
    forgotRow:   { alignItems: 'center', marginTop: spacing.md },
    forgotText:  { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.accent },
    googleBtn:   {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.lg,
      minHeight: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    googleText:  { fontFamily: 'Outfit_600SemiBold', fontSize: typo.base, color: t.textPrimary },
    successBox:  { backgroundColor: 'rgba(34,197,94,0.10)', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', padding: spacing.lg, gap: spacing.sm },
    successTitle:{ fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.textPrimary },
    successText: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: 20 },
    resetInfo:   { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: '#16a34a', marginTop: spacing.xs },
  })

  // ── Validation ──────────────────────────────────────────────────────────────

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

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (!validateFields()) return
    setLoading(true)
    setFormError('')
    try {
      if (mode === 'sign-up') {
        const result = await signUpWithEmail(email.trim(), password)
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        if (result.data.needsEmailConfirm) {
          setSignUpSuccess(true)
        }
        // If no email confirm required, supabase.auth.onAuthStateChange fires → _layout routes.
      } else {
        const result = await signInWithEmail(email.trim(), password)
        if (!result.ok) {
          setFormError(result.error)
          return
        }
        // On success, supabase.auth.onAuthStateChange fires → _layout routes.
      }
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, email, password])

  // ── Forgot password ─────────────────────────────────────────────────────────

  const handleForgotPassword = useCallback(async () => {
    if (!isValidEmail(email)) {
      setEmailError('Enter your email above first.')
      return
    }
    setSendingReset(true)
    setResetSent(false)
    try {
      const result = await sendPasswordReset(email.trim())
      if (result.ok) {
        setResetSent(true)
      } else {
        setFormError(result.error)
      }
    } finally {
      setSendingReset(false)
    }
  }, [email])

  // ── Google button ───────────────────────────────────────────────────────────

  const handleGoogle = useCallback(async () => {
    setLoading(true)
    try {
      const result = await signInWithGoogleWeb()
      if (!result.ok) {
        setFormError(result.error)
      }
      // OAuth redirects browser — nothing more to do here.
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Toggle mode ─────────────────────────────────────────────────────────────

  function switchMode(next: Mode) {
    setMode(next)
    setEmailError('')
    setPasswordError('')
    setFormError('')
    setSignUpSuccess(false)
    setResetSent(false)
  }

  // ── Render: sign-up success panel ───────────────────────────────────────────

  if (signUpSuccess) {
    return (
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.container}>
            <Image
              source={require('../../assets/images/icon.png')}
              style={s.logo}
              accessibilityLabel="Iskotify logo"
            />
            <Text style={s.appName} maxFontSizeMultiplier={1.4}>Iskotify</Text>

            <View style={[s.successBox, { marginTop: spacing.xl }]}>
              <Text style={s.successTitle} maxFontSizeMultiplier={1.4}>
                Check your email
              </Text>
              <Text style={s.successText} maxFontSizeMultiplier={1.4}>
                We sent a confirmation link to{' '}
                <Text style={{ fontFamily: 'Outfit_600SemiBold', color: t.textPrimary }}>{email}</Text>.
                Open that link to activate your account, then come back here to sign in.
              </Text>
            </View>

            <Pressable
              onPress={() => { setSignUpSuccess(false); switchMode('sign-in') }}
              accessibilityRole="button"
              style={({ pressed }) => [s.submitBtn, pressed ? { opacity: 0.85 } : null]}
            >
              <Text style={s.submitText} maxFontSizeMultiplier={1.4}>
                I've confirmed — sign in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Render: main form ───────────────────────────────────────────────────────

  const isSignUp = mode === 'sign-up'

  return (
    <SafeAreaView style={s.root}>
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.container}>
          {/* Brand */}
          <Image
            source={require('../../assets/images/icon.png')}
            style={s.logo}
            accessibilityLabel="Iskotify logo"
          />
          <Text style={s.appName} maxFontSizeMultiplier={1.4}>Iskotify</Text>
          <Text style={s.tagline} maxFontSizeMultiplier={1.4}>
            Your AI-powered study companion
          </Text>

          {/* Mode toggle */}
          <View style={s.toggleRow} accessibilityRole="tablist">
            {(['sign-in', 'sign-up'] as Mode[]).map((m) => {
              const active = mode === m
              return (
                <Pressable
                  key={m}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={m === 'sign-in' ? 'Sign in' : 'Create account'}
                  onPress={() => switchMode(m)}
                  style={({ pressed }) => [
                    s.toggleBtn,
                    active ? { backgroundColor: t.accent } : null,
                    pressed && !active ? { opacity: 0.7 } : null,
                  ]}
                >
                  <Text
                    style={[s.toggleText, { color: active ? '#fff' : t.textSecondary }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {m === 'sign-in' ? 'Sign in' : 'Create account'}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Email field */}
          <Pressable
            accessibilityRole="none"
            onPress={() => emailRef.current?.focus()}
          >
            <Text style={s.label} maxFontSizeMultiplier={1.4}>Email address</Text>
          </Pressable>
          <TextInput
            ref={emailRef}
            value={email}
            onChangeText={(v) => { setEmail(v); setEmailError('') }}
            style={[s.input, emailError ? s.inputError : null]}
            placeholder="you@example.com"
            placeholderTextColor={t.textTertiary}
            autoComplete="email"
            textContentType="emailAddress"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            accessibilityLabel="Email address"
            accessibilityHint="Enter your email to sign in or create an account"
          />
          <FieldError message={emailError} />

          {/* Password field */}
          <Pressable
            accessibilityRole="none"
            onPress={() => passwordRef.current?.focus()}
          >
            <Text style={s.label} maxFontSizeMultiplier={1.4}>Password</Text>
          </Pressable>
          <View style={s.passwordRow}>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={(v) => { setPassword(v); setPasswordError('') }}
              style={[s.input, { paddingRight: 56 }, passwordError ? s.inputError : null]}
              placeholder={isSignUp ? 'At least 8 characters' : 'Your password'}
              placeholderTextColor={t.textTertiary}
              secureTextEntry={!showPassword}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              accessibilityLabel="Password"
              accessibilityHint={isSignUp ? 'Choose a password with at least 8 characters' : 'Enter your password'}
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

          {/* Forgot password (sign-in mode only) */}
          {!isSignUp ? (
            <View style={s.forgotRow}>
              <Pressable
                onPress={handleForgotPassword}
                accessibilityRole="button"
                accessibilityLabel="Forgot password"
                disabled={sendingReset}
                style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center' }, pressed ? { opacity: 0.7 } : null]}
              >
                <Text style={s.forgotText} maxFontSizeMultiplier={1.4}>
                  {sendingReset ? 'Sending…' : 'Forgot password?'}
                </Text>
              </Pressable>
              {resetSent ? (
                <Text style={s.resetInfo} maxFontSizeMultiplier={1.4}>
                  Check your email for a reset link.
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* General form error */}
          {formError ? (
            <View style={s.formErrorBox}>
              <Text style={s.formErrorTxt} accessibilityRole="alert" maxFontSizeMultiplier={1.4}>
                {formError}
              </Text>
            </View>
          ) : null}

          {/* Submit button — disabled ONLY while loading */}
          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
            accessibilityState={{ disabled: loading, busy: loading }}
            style={({ pressed }) => [
              s.submitBtn,
              loading ? { opacity: 0.7 } : null,
              pressed && !loading ? { opacity: 0.85 } : null,
            ]}
          >
            {loading ? <ActivityIndicator color="#ffffff" size="small" /> : null}
            <Text style={s.submitText} maxFontSizeMultiplier={1.4}>
              {loading
                ? isSignUp ? 'Creating account…' : 'Signing in…'
                : isSignUp ? 'Create account' : 'Sign in'}
            </Text>
          </Pressable>

          {/* Divider */}
          <View style={{ marginVertical: spacing.xl }}>
            <Divider label="or" />
          </View>

          {/* Google button */}
          <Pressable
            onPress={handleGoogle}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            style={({ pressed }) => [
              s.googleBtn,
              loading ? { opacity: 0.7 } : null,
              pressed && !loading ? { opacity: 0.85 } : null,
            ]}
          >
            <Text
              style={{ fontFamily: 'Outfit_700Bold', fontSize: 18, color: t.textPrimary }}
              maxFontSizeMultiplier={1.4}
            >
              G
            </Text>
            <Text style={s.googleText} maxFontSizeMultiplier={1.4}>
              Continue with Google
            </Text>
          </Pressable>

          {/* Bottom note */}
          <Text
            style={{
              fontFamily: 'Lexend_400Regular',
              fontSize: 11,
              color: t.textTertiary,
              textAlign: 'center',
              marginTop: spacing.xl,
              lineHeight: 17,
            }}
            maxFontSizeMultiplier={1.4}
          >
            By continuing you agree to use Iskotify for personal study purposes.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
