import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Platform } from 'react-native'
import { router, useLocalSearchParams, Redirect, type Href } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined } from '@lineiconshq/free-icons'
import { Screen } from '../components/ui/Screen'
import { PageTitle } from '../components/ui/PageTitle'
import { Button } from '../components/ui/Button'
import { PressableScale } from '../components/ui/Pressable'
import { Text } from '../components/ui/Text'
import { DetailTopBar } from '../components/explore/DetailTopBar'
import { decorative, focusRing, heading } from '../components/ui/a11y'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, weight } from '../theme/tokens'
import { usePremium } from '../hooks/usePremium'
import { PURCHASE_CHANNEL, getFullAccessPrice, storeAvailable } from '../services/premium'
import { buyFullAccess, restoreFullAccessForUser, confirmPurchase, pollPremium } from '../services/premiumState'
import { supabase } from '../services/supabase'
import { capture } from '../lib/analytics'
import { FREE_DAILY_PRACTICE_QUESTIONS } from '../utils/premiumLimits'

// Iskotify Full Access (P3): one-time ₱500, no ads, no subscription.
// Android buys through Google Play (RevenueCat); web buys through PayMongo
// (GCash, Maya or card). Either unlocks both. Access is granted only when the
// server entitlement row says so, so after paying this screen waits for it
// ("Confirming your purchase"). The Android build never mentions the web
// purchase or its price (Play payments policy). A build that can't sell
// (iOS for now, or no store key) shows no purchase at all.

type Phase =
  | 'idle'        // ready to buy
  | 'working'     // store sheet / checkout request in flight
  | 'confirming'  // paid; waiting for the server to record it
  | 'pending'     // still not recorded after ~30 s
  | 'success'
  | 'cancelled'   // web: back from PayMongo without paying
  | 'error'
  | 'not_found'   // restore found nothing

// Explanations (the main one and the per-option ones) are free for everyone,
// so Full Access is exactly these two lines.
const INCLUDED = [
  'Unlimited practice questions, every day',
  'Unlimited full mock exams',
] as const

const STILL_FREE =
  `Still free for everyone: the diagnostic, flashcards, Study Sprint, notes, scholarships, the estimator, every explanation, one full mock per exam and ${FREE_DAILY_PRACTICE_QUESTIONS} practice questions a day.`

const signInHref = (Platform.OS === 'web' ? '/auth/sign-in' : '/landing') as Href

export default function UpgradeScreen() {
  const { status: returnStatus, from } = useLocalSearchParams<{ status?: string; from?: string }>()
  const { enabled, isPremium } = usePremium()
  const { theme: t } = useTheme()
  const play = PURCHASE_CHANNEL === 'play'
  const canBuy = storeAvailable()

  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [price, setPrice] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>(returnStatus === 'cancelled' ? 'cancelled' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const lastAction = useRef<'buy' | 'restore'>('buy')
  const viewed = useRef(false)
  // One purchase / restore at a time: a double tap lands before the button re-renders as busy.
  const inFlight = useRef(false)
  // Aborted on unmount: the confirmation polling stops and no state is set afterwards.
  const life = useRef(new AbortController())
  useEffect(() => {
    if (life.current.signal.aborted) life.current = new AbortController() // remounted (Strict Mode)
    const ctrl = life.current
    return () => ctrl.abort()
  }, [])
  const signal = () => life.current.signal
  const gone = () => life.current.signal.aborted

  useEffect(() => {
    if (!enabled) return
    let live = true
    void supabase.auth.getSession()
      .then(({ data }) => { if (live) setSignedIn(!!data.session) })
      .catch(() => { if (live) setSignedIn(false) })
    void getFullAccessPrice().then(p => { if (live) setPrice(p) }).catch(() => undefined)
    return () => { live = false }
  }, [enabled])

  useEffect(() => {
    if (!enabled || viewed.current) return
    viewed.current = true
    capture('paywall_viewed', { source: typeof from === 'string' && from ? from : 'direct', channel: PURCHASE_CHANNEL })
  }, [enabled, from])

  /** Wait for the server to record the purchase (it can lag the payment by a few seconds). */
  const confirm = useCallback(async (wait: () => Promise<boolean>) => {
    setPhase('confirming')
    setError(null)
    const ok = await wait()
    if (life.current.signal.aborted) return // the screen closed: no state updates
    if (ok) {
      setPhase('success')
      capture('purchase_completed', { channel: PURCHASE_CHANNEL })
    } else {
      setPhase('pending')
    }
  }, [])

  // Web: PayMongo sent the student back here after paying.
  const returned = useRef(false)
  useEffect(() => {
    if (!enabled || returnStatus !== 'success' || returned.current) return
    returned.current = true
    void confirm(() => pollPremium({ signal: life.current.signal }))
  }, [enabled, returnStatus, confirm])

  /** Runs one purchase / restore / re-check; a second tap while one runs is ignored. */
  async function once(run: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    try { await run() } finally { inFlight.current = false }
  }

  const buy = () => once(async () => {
    lastAction.current = 'buy'
    setPhase('working')
    setError(null)
    capture('purchase_started', { channel: PURCHASE_CHANNEL, source: typeof from === 'string' && from ? from : 'direct' })
    const res = await buyFullAccess()
    if (gone()) return
    switch (res.status) {
      case 'success': await confirm(async () => (await confirmPurchase({ signal: signal() })) === 'confirmed'); return
      case 'redirecting': return // the browser is leaving for the checkout page
      case 'already_premium': await confirm(() => pollPremium({ signal: signal() })); return
      case 'cancelled': setPhase('idle'); return
      case 'signed_out': setSignedIn(false); setPhase('idle'); return
      case 'error': setError(res.message); setPhase('error'); return
      default: setPhase('idle')
    }
  })

  const restore = () => once(async () => {
    lastAction.current = 'restore'
    setPhase('working')
    setError(null)
    const res = await restoreFullAccessForUser()
    if (gone()) return
    if (res.status === 'success') { await confirm(async () => (await confirmPurchase({ signal: signal() })) === 'confirmed'); return }
    if (res.status === 'signed_out') { setSignedIn(false); setPhase('idle'); return }
    if (res.status === 'error') { setError(res.message); setPhase('error'); return }
    // Nothing in the store: the account may still hold Full Access on the server.
    setPhase('working')
    const found = await pollPremium({ signal: signal() })
    if (gone()) return
    setPhase(found ? 'success' : 'not_found')
  })

  const checkAgain = () => once(() => confirm(() => pollPremium({ signal: signal() })))

  if (!enabled) return <Redirect href="/profile" />

  const busy = phase === 'working' || phase === 'confirming'
  const owned = isPremium || phase === 'success'

  const statusMessage =
    phase === 'confirming' ? 'Confirming your purchase. This takes a few seconds.'
    : phase === 'pending' ? "Your payment went through. Confirming it may take a minute. You can check again, or come back later."
    : phase === 'cancelled' ? 'Payment cancelled. Nothing was charged.'
    : phase === 'not_found' ? (play
        ? "We couldn't find a Full Access purchase on this Google account."
        : "We couldn't find Full Access on this account yet.")
    : null

  const priceText = play
    ? (price ? `${price}, one-time payment` : canBuy ? 'One-time payment. Google Play shows the price.' : 'One-time payment.')
    : `${price ?? '₱500'}, one-time payment`

  return (
    <Screen header={<DetailTopBar bare fallbackHref="/profile" />}>
      <PageTitle title="Iskotify Full Access" lead="Pay once and keep it. No ads." />

      <View style={{ gap: spacing.xxl }}>
        {owned ? (
          <View
            style={{
              flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.successSurface,
              borderWidth: 1, borderColor: t.successBorder, borderRadius: radius.card, borderCurve: 'continuous', padding: spacing.lg,
            }}
          >
            <View {...decorative}>
              <Lineicons icon={CheckCircle1Outlined} size={24} color={t.successStrong} />
            </View>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Text role="headline" {...heading(2)}>You have Full Access</Text>
              <Text role="footnote" color={t.textSecondary}>
                Unlimited practice and full mocks are on, on every device you sign in to.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <Text role="title3" {...heading(2)} maxFontSizeMultiplier={1.6}>What you get</Text>
          <View style={{ gap: spacing.sm }}>
            {INCLUDED.map(line => (
              <View key={line} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View {...decorative} style={{ paddingTop: 2 }}>
                  <Lineicons icon={CheckCircle1Outlined} size={18} color={t.accentText} />
                </View>
                <Text role="body" style={{ flex: 1 }}>{line}</Text>
              </View>
            ))}
          </View>
          <Text role="footnote" color={t.textSecondary}>{STILL_FREE}</Text>
        </View>

        {statusMessage ? (
          <Text role="body" accessibilityLiveRegion="polite" aria-live="polite">
            {statusMessage}
          </Text>
        ) : null}
        {phase === 'error' && error ? (
          <Text role="body" color={t.danger} accessibilityRole="alert">{error}</Text>
        ) : null}

        {owned ? (
          <Button label="Start practising" size="lg" fullWidth onPress={() => router.replace('/(tabs)/practice' as Href)} />
        ) : (
          <View style={{ gap: spacing.md }}>
            <View style={{ gap: spacing.xs }}>
              <Text role="headline">{priceText}</Text>
              <Text role="footnote" color={t.textSecondary}>
                Not a subscription. You pay once and Full Access stays on your account.
              </Text>
            </View>

            {signedIn === null ? null : signedIn === false ? (
              <View style={{ gap: spacing.sm }}>
                <Text role="body">
                  Sign in first. Full Access belongs to your account, so it works on every device you sign in to.
                </Text>
                <Button label="Sign in to continue" size="lg" fullWidth onPress={() => router.push(signInHref)} />
              </View>
            ) : !canBuy ? (
              <Text role="body">Not available on this device yet.</Text>
            ) : phase === 'pending' ? (
              <Button label="Check again" size="lg" fullWidth onPress={() => void checkAgain()} />
            ) : phase === 'error' ? (
              <Button
                label="Try again"
                size="lg"
                fullWidth
                loading={busy}
                onPress={() => void (lastAction.current === 'restore' ? restore() : buy())}
              />
            ) : (
              <Button
                label={play ? 'Buy through Google Play' : 'Pay with GCash, Maya or card'}
                size="lg"
                fullWidth
                loading={busy}
                onPress={() => void buy()}
              />
            )}

            {play && signedIn && canBuy ? (
              <Button
                label="Restore purchases"
                variant="ghost"
                fullWidth
                disabled={busy}
                onPress={() => void restore()}
                accessibilityHint="Finds a Full Access purchase you already made with this Google account"
              />
            ) : null}

            <Text role="footnote" color={t.textSecondary}>
              Under 18? Ask your parent or guardian before you buy.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.xs }}>
              <Text role="footnote" color={t.textSecondary}>By buying you agree to the</Text>
              <PressableScale
                accessibilityRole="link"
                accessibilityLabel="Terms of Service"
                onPress={() => router.push('/terms')}
                style={({ focused }) => [{ minHeight: 44, justifyContent: 'center' }, focusRing(t.focusRing, focused)]}
              >
                <Text role="footnote" color={t.accentText} style={[weight('600'), { textDecorationLine: 'underline' }]}>
                  Terms of Service
                </Text>
              </PressableScale>
            </View>
          </View>
        )}
      </View>
    </Screen>
  )
}
