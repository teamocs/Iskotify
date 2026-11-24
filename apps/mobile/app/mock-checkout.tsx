import { useState } from 'react'
import { View, Platform } from 'react-native'
import { router, useLocalSearchParams, Redirect, type Href } from 'expo-router'
import { Screen } from '../components/ui/Screen'
import { Button } from '../components/ui/Button'
import { Text } from '../components/ui/Text'
import { heading } from '../components/ui/a11y'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius } from '../theme/tokens'
import { usePremium } from '../hooks/usePremium'
import { callMockPayment } from '../services/entitlements'

// Test checkout: stands in for the payment gateway's page while no gateway is
// connected. The server sends only admin accounts here and only they can complete it
// (POST /api/payments/mock); anyone else who opens it gets an error on Pay.
export default function MockCheckoutScreen() {
  const { reference } = useLocalSearchParams<{ reference?: string }>()
  const { enabled } = usePremium()
  const { theme: t } = useTheme()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  if (Platform.OS !== 'web' || !enabled || typeof reference !== 'string' || !reference) return <Redirect href="/upgrade" />
  const back = (status: 'success' | 'cancelled') => router.replace(`/upgrade?status=${status}` as Href)

  async function pay() {
    if (busy) return
    setBusy(true)
    setFailed(false)
    const ok = await callMockPayment({ action: 'pay', reference: reference as string })
    setBusy(false)
    if (ok) back('success')
    else setFailed(true)
  }

  return (
    <Screen>
      <View style={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
        <View style={{ gap: spacing.sm }}>
          <Text role="largeTitle" {...heading(1)} maxFontSizeMultiplier={1.5}>Test checkout</Text>
          <Text role="body" color={t.textSecondary}>
            No money moves here. This page stands in for the payment provider while we test.
          </Text>
        </View>
        <View
          style={{
            backgroundColor: t.surface, borderRadius: radius.card, borderCurve: 'continuous',
            borderWidth: 1, borderColor: t.border, padding: spacing.xl, gap: spacing.lg,
          }}
        >
          <Text role="title2" maxFontSizeMultiplier={1.6}>Iskotify Full Access, ₱500 (test)</Text>
          <Text role="footnote" color={t.textSecondary} style={{ flexShrink: 1 }}>{reference}</Text>
          {failed ? (
            <Text role="body" color={t.danger} accessibilityRole="alert">
              The test payment was refused. Only admin accounts can use this page, and only while real payments are off.
            </Text>
          ) : null}
          <Button label="Complete test payment" size="lg" fullWidth loading={busy} onPress={() => void pay()} />
          <Button
            label="Return without confirming"
            variant="secondary"
            fullWidth
            disabled={busy}
            onPress={() => back('success')}
            accessibilityHint="Simulates a payment whose confirmation has not arrived"
          />
          <Button label="Cancel" variant="ghost" fullWidth disabled={busy} onPress={() => back('cancelled')} />
        </View>
      </View>
    </Screen>
  )
}
