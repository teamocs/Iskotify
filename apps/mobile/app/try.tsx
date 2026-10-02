/**
 * /try: the web glimpse (P4). Iskotify has no iOS app yet, so a signed-out
 * web visitor can take the free diagnostic without an account, then is
 * invited to create a free one (the results screen does that).
 *
 * Reachable signed out on web only (utils/webEntryTarget.ts GUEST_ROUTES);
 * signed in, the gate sends the student into the app. Nothing here is saved to
 * an account: the run stays in this browser and is merged into the account the
 * visitor creates (services/guestPreview.ts). The diagnostic is free, so no
 * upgrade UI appears, paywall or not.
 */
import { useEffect, useState } from 'react'
import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { Screen } from '../components/ui/Screen'
import { PageTitle } from '../components/ui/PageTitle'
import { Button } from '../components/ui/Button'
import { Skeleton } from '../components/ui/Skeleton'
import { ChoiceRow } from '../components/onboarding/ChoiceRow'
import { LegalLine } from '../components/consent/LegalLinks'
import { heading } from '../components/ui/a11y'
import { useTheme } from '../theme/ThemeContext'
import { radius, spacing, textStyle } from '../theme/tokens'
import { useDb } from '../hooks/useDb'
import { useGuestMode } from '../hooks/useGuestMode'
import { listRunnableBlueprints } from '../services/examBlueprints'
import {
  buildGuestExamOptions, guestDiagnosticHref, guestExamCaption, type GuestExamOption,
} from '../utils/guestPreview'

const FACTS = [
  'A short timed diagnostic: one minute per question, in the exam’s own sections.',
  'Nothing is saved to an account. You don’t need one to try it.',
  'Your results stay on this device. Create a free account afterwards to keep them.',
] as const

export default function TryScreen() {
  const db = useDb()
  const { theme: t } = useTheme()
  const { mode, catalogReady } = useGuestMode()
  const [options, setOptions] = useState<GuestExamOption[] | null>(null)
  const [selected, setSelected] = useState('upcat')

  // A signed-in student has the whole app: send them in.
  useEffect(() => {
    if (mode === 'member') router.replace('/(tabs)')
  }, [mode])

  // The exam list is read once the catalog has synced (a fresh browser has none).
  useEffect(() => {
    if (mode !== 'guest' || !catalogReady) return
    let alive = true
    listRunnableBlueprints(db)
      .then(runnable => { if (alive) setOptions(buildGuestExamOptions(runnable)) })
      .catch(e => {
        console.warn('[try] exam list failed, offering UPCAT only:', e)
        if (alive) setOptions(buildGuestExamOptions([]))
      })
    return () => { alive = false }
  }, [db, mode, catalogReady])

  const signIn = () => router.replace('/auth/sign-in')

  if (mode === 'held') {
    return (
      <Screen>
        <View style={{ gap: spacing.xl, paddingTop: spacing.lg }}>
          <PageTitle
            title="Sign in to continue"
            lead="This browser still holds an Iskotify account that signed out. Sign in to use it, or open a private window to try the diagnostic as a guest."
          />
          <Button label="Sign in" onPress={signIn} size="lg" fullWidth />
        </View>
      </Screen>
    )
  }

  const ready = mode === 'guest' && catalogReady && options !== null

  return (
    <Screen>
      <View style={{ gap: spacing.xxl, paddingTop: spacing.lg }}>
        <PageTitle
          title="Try a free diagnostic"
          lead="See where you stand for your entrance exam before you make an account."
        />

        <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.lg, gap: spacing.md }}>
          {FACTS.map(f => (
            <Text key={f} style={textStyle('body', t.textPrimary)} maxFontSizeMultiplier={2}>{f}</Text>
          ))}
        </View>

        {!ready ? (
          <View accessible accessibilityLabel="Getting the questions ready" aria-busy style={{ gap: spacing.md }}>
            <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>Getting the questions ready…</Text>
            <Skeleton height={64} radius={radius.lg} />
            <Skeleton height={64} radius={radius.lg} />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Text {...heading(2)} style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>Choose your exam</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Choose your exam" style={{ gap: spacing.sm }}>
              {options.map(o => (
                <ChoiceRow
                  key={o.slug}
                  mode="radio"
                  label={o.acronym}
                  description={`${o.name}. ${guestExamCaption(o)}`}
                  accessibilityLabel={`${o.acronym}, ${o.name}`}
                  selected={selected === o.slug}
                  onPress={() => setSelected(o.slug)}
                />
              ))}
            </View>
          </View>
        )}

        <View style={{ gap: spacing.md }}>
          {ready ? (
            <Button
              label="Start the diagnostic"
              onPress={() => router.push(guestDiagnosticHref(selected))}
              size="lg"
              fullWidth
            />
          ) : null}
          <LegalLine verb="starting" />
          <Button label="I have an account. Sign in" variant="ghost" onPress={signIn} fullWidth />
        </View>
      </View>
    </Screen>
  )
}
