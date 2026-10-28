import { useCallback, useEffect, useRef, useState } from 'react'
import { View, Platform } from 'react-native'
import { router, useLocalSearchParams, Redirect, type Href } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined, Crown3Outlined, FileQuestionOutlined, Pencil1Outlined } from '@lineiconshq/free-icons'
import { Screen } from '../components/ui/Screen'
import { Button } from '../components/ui/Button'
import { PressableScale } from '../components/ui/Pressable'
import { Text } from '../components/ui/Text'
import { DetailTopBar } from '../components/explore/DetailTopBar'
import { decorative, focusRing, heading } from '../components/ui/a11y'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, weight, layout, type Theme } from '../theme/tokens'
import { usePremium } from '../hooks/usePremium'
import { PURCHASE_CHANNEL, getFullAccessPrice, storeAvailable } from '../services/premium'
import { buyFullAccess, restoreFullAccessForUser, confirmPurchase, pollPremium } from '../services/premiumState'
import { supabase } from '../services/supabase'
import { capture } from '../lib/analytics'
import { FREE_DAILY_PRACTICE_QUESTIONS, FREE_FULL_MOCKS_PER_EXAM } from '../utils/premiumLimits'

// Iskotify Full Access (P3): one-time ₱500, no ads, no subscription.
// Android buys through Google Play (RevenueCat); web buys through PayMongo
// (GCash, Maya or card). Either unlocks both. Access is granted only when the
// server entitlement row says so, so after paying this screen waits for it
// ("Confirming your purchase"). The Android build never mentions the web
// purchase or its price (Play payments policy). A build that can't sell
// (iOS for now, or no store key) shows no purchase at all.
//
// Layout (paywall research, 2026-10-28): one outcome headline, the two things
// Full Access changes with the free limit beside each, then one card holding
// the price, the single primary action, restore and the small print. No
// urgency, no anchoring against invented prices, no new motion: state changes
// are announced, not animated.

type Phase =
  | 'idle'        // ready to buy
  | 'working'     // store sheet / checkout request in flight
  | 'confirming'  // paid; waiting for the server to record it
  | 'pending'     // still not recorded after ~30 s
  | 'success'
  | 'cancelled'   // web: back from PayMongo without paying
  | 'error'
  | 'not_found'   // restore found nothing

type Icon = typeof CheckCircle1Outlined

// Explanations (the main one and the per-option ones) are free for everyone,
// so Full Access is exactly these two lines.
const INCLUDED: { icon: Icon; title: string; free: string }[] = [
  { icon: Pencil1Outlined, title: 'Unlimited practice questions, every day', free: `Free: ${FREE_DAILY_PRACTICE_QUESTIONS} a day` },
  { icon: FileQuestionOutlined, title: 'Unlimited full mock exams', free: `Free: ${FREE_FULL_MOCKS_PER_EXAM} per exam` },
]

const STILL_FREE =
  `Still free for everyone: the diagnostic, flashcards, Study Sprint, notes, scholarships, the estimator, every explanation, one full mock per exam and ${FREE_DAILY_PRACTICE_QUESTIONS} practice questions a day.`

const signInHref = (Platform.OS === 'web' ? '/auth/sign-in' : '/landing') as Href

/** The maroon lead card: the page's one h1 and the outcome. White on maroon is 10.95:1. */
function Hero({ t }: { t: Theme }) {
  return (
    <View
      style={{
        backgroundColor: t.accent, borderRadius: radius.sheet, borderCurve: 'continuous', overflow: 'hidden',
        padding: spacing.xxl, paddingTop: spacing.xxxl, gap: spacing.lg, marginBottom: spacing.xxl,
      }}
    >
      {/* Two soft discs for depth; static, decorative. */}
      <View
        {...decorative}
        style={{ position: 'absolute', width: 220, height: 220, borderRadius: 110, right: -70, top: -90, backgroundColor: t.textInverse, opacity: 0.07 }}
      />
      <View
        {...decorative}
        style={{ position: 'absolute', width: 140, height: 140, borderRadius: 70, right: 40, bottom: -80, backgroundColor: t.textInverse, opacity: 0.05 }}
      />
      <View
        {...decorative}
        style={{
          width: 48, height: 48, borderRadius: radius.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.scrimControl,
        }}
      >
        <Lineicons icon={Crown3Outlined} size={26} color={t.textInverse} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <Text role="largeTitle" color={t.textInverse} {...heading(1)} maxFontSizeMultiplier={1.5}>
          Iskotify Full Access
        </Text>
        <Text role="body" color={t.textInverse} style={{ opacity: 0.88 }} maxFontSizeMultiplier={2}>
          Practise without limits. Pay once and keep it. No ads.
        </Text>
      </View>
    </View>
  )
}

/** One thing Full Access changes, with today's free limit beside it. */
function Benefit({ t, icon, title, free }: { t: Theme; icon: Icon; title: string; free: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: layout.rowMinHeight }}>
      <View
        {...decorative}
        style={{
          width: 40, height: 40, borderRadius: radius.button, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
          backgroundColor: t.accentSurface,
        }}
      >
        <Lineicons icon={icon} size={20} color={t.accentText} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text role="headline">{title}</Text>
        <Text role="footnote" color={t.textSecondary}>{free}</Text>
      </View>
    </View>
  )
}

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

  const card = {
    backgroundColor: t.surface, borderRadius: radius.card, borderCurve: 'continuous' as const,
    borderWidth: 1, borderColor: t.border, padding: spacing.xl,
  }

  return (
    <Screen header={<DetailTopBar bare fallbackHref="/profile" />}>
      <Hero t={t} />

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

        <View style={{ gap: spacing.lg }}>
          <Text role="title3" {...heading(2)} maxFontSizeMultiplier={1.6}>What you get</Text>
          <View style={[card, { gap: spacing.lg, paddingVertical: spacing.lg }]}>
            {INCLUDED.map(item => (
              <Benefit key={item.title} t={t} icon={item.icon} title={item.title} free={item.free} />
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
          <View style={[card, { gap: spacing.lg, borderColor: t.accentBorder }]}>
            <View style={{ gap: spacing.xs }}>
              <Text role="title2" maxFontSizeMultiplier={1.6}>{priceText}</Text>
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

            <View style={{ gap: spacing.xs, borderTopWidth: 1, borderTopColor: t.divider, paddingTop: spacing.md }}>
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
          </View>
        )}
      </View>
    </Screen>
  )
}
