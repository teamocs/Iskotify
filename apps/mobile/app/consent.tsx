import { useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../hooks/useDb'
import { useTheme } from '../theme/ThemeContext'
import { spacing, textStyle } from '../theme/tokens'
import { useBreakpoint, pagePadding } from '../hooks/useBreakpoint'
import { Button } from '../components/ui/Button'
import { heading } from '../components/ui/a11y'
import { ConsentControls, type ConsentFormValue } from '../components/consent/ConsentControls'
import { recordConsent } from '../services/consent'
import { applyAnalyticsConsent } from '../services/analyticsConsent'
import { consentFormReason } from '../utils/consent'

/**
 * One-time, full-screen "We've updated our Terms and Privacy Policy" for
 * students who finished onboarding before consent existed, or before the texts
 * changed (the root gate sends them here from any route, see
 * components/consent/ConsentGate.tsx).
 * The same three controls as onboarding's first step, nothing pre-ticked, a
 * clear way to read the documents, and one primary action.
 */
export default function ConsentUpdateScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const [form, setForm] = useState<ConsentFormValue>({ ageBand: null, terms: false, guardian: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reason = consentFormReason(form)

  async function agree() {
    if (reason || !form.ageBand) return
    setSaving(true)
    setError(null)
    try {
      await recordConsent(db, { ageBand: form.ageBand })
      await applyAnalyticsConsent(db)
      router.replace('/(tabs)')
    } catch (e) {
      console.warn('[consent] could not save consent:', e)
      setError("Couldn't save your choice. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            width: '100%', maxWidth: 560, alignSelf: 'center', gap: spacing.xxl,
            paddingHorizontal: pagePadding(bp), paddingTop: spacing.xxxl, paddingBottom: spacing.xxl,
          }}
        >
          <View style={{ gap: spacing.sm }}>
            <Text {...heading(1)} style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>
              We&apos;ve updated our Terms and Privacy Policy
            </Text>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
              Please take a moment to read them, then tell us you agree to keep using Iskotify.
            </Text>
          </View>

          <ConsentControls value={form} onChange={setForm} />

          <View style={{ gap: spacing.sm }}>
            {reason ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[textStyle('bodySm', t.textSecondary), { textAlign: 'center' }]}
                maxFontSizeMultiplier={2}
              >
                {reason}
              </Text>
            ) : null}
            {error ? (
              <Text accessibilityRole="alert" style={[textStyle('bodySm', t.danger), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
                {error}
              </Text>
            ) : null}
            <Button
              label="Agree and continue"
              size="lg"
              fullWidth
              disabled={!!reason}
              loading={saving}
              onPress={() => void agree()}
            />
            <Text style={[textStyle('caption', t.textSecondary), { textAlign: 'center' }]} maxFontSizeMultiplier={2}>
              {"If you don't agree, you can close the app. Iskotify can't be used without agreeing."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
