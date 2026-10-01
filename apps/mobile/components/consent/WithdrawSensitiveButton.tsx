import { useState } from 'react'
import { View, Text } from 'react-native'
import { Button } from '../ui/Button'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { useDb } from '../../hooks/useDb'
import { confirmAction } from '../../utils/confirmAction'
import { withdrawSensitiveConsent } from '../../services/consent'

/**
 * "Withdraw consent and clear these details": after a confirmation, clears the
 * grades, income and Indigenous status on this phone, turns the consent off and
 * schedules a backup so the cloud copy is cleared too.
 */
export function WithdrawSensitiveButton({ onWithdrawn }: { onWithdrawn?: () => void }) {
  const db = useDb()
  const { theme: t } = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await withdrawSensitiveConsent(db)
      onWithdrawn?.()
    } catch (e) {
      console.warn('[consent] withdraw failed:', e)
      setError("Couldn't clear your details. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <Button
        label="Withdraw consent and clear these details"
        variant="danger"
        size="lg"
        loading={busy}
        onPress={() => confirmAction(
          'Withdraw consent?',
          'This clears your grades, household income and Indigenous Peoples status from this phone and from your cloud backup. Scholarship matches and your admission estimate will ask for them again.',
          'Withdraw and clear',
          run,
          { destructive: true },
        )}
      />
      {error ? (
        <Text accessibilityRole="alert" style={textStyle('bodySm', t.dangerStrong)} maxFontSizeMultiplier={2}>{error}</Text>
      ) : null}
    </View>
  )
}
