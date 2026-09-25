import { useState, useCallback } from 'react'
import { View, Text } from 'react-native'
// RN Image is fine for a local screenshot preview.
// react-doctor-disable-next-line react-doctor/rn-prefer-expo-image
import { Image } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Camera1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { InfoPage } from '../../components/info/InfoPage'
import { StatusPanel } from '../../components/auth/AuthLayout'
import { Button } from '../../components/ui/Button'
import { FilterChip } from '../../components/ui/Chip'
import { TextField } from '../../components/ui/TextField'
import { goBackOr } from '../../components/explore/DetailTopBar'
import { submitBugReport } from '../../services/appFeedback'

// Where it happened, in the app's current names. "General" is the default so
// a student never has to pick one to file a report.
const AREAS = ['General', 'Today', 'Practice', 'Explore', 'Progress', 'Settings'] as const

interface PickedImage {
  uri: string
  name: string
}

export default function ReportBugScreen() {
  const { theme: t } = useTheme()

  const [area, setArea] = useState<string>('General')
  const [description, setDescription] = useState('')
  const [image, setImage] = useState<PickedImage | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successShown, setSuccessShown] = useState(false)

  const canSubmit = description.trim().length > 0 && !isSubmitting

  const handleAttach = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      if (result.canceled) return
      const asset = result.assets?.[0]
      if (asset?.uri) setImage({ uri: asset.uri, name: asset.name ?? 'screenshot' })
    } catch {
      // Picker failures are non-fatal — the student can still file a text report.
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (description.trim().length === 0) return
    setError(null)
    setIsSubmitting(true)
    try {
      const ok = await submitBugReport({ screen: area, description, imageUri: image?.uri })
      if (ok) setSuccessShown(true)
      else setError("We couldn't send your report. Check your connection and try again; what you wrote is still here.")
    } catch {
      setError('Something went wrong. Please try again; what you wrote is still here.')
    } finally {
      setIsSubmitting(false)
    }
  }, [area, description, image])

  if (successShown) {
    return (
      <InfoPage title="Report a bug">
        <View style={{ gap: spacing.lg }}>
          <StatusPanel tone="success" title="Report sent. Salamat!">
            <Text style={textStyle('bodySm', t.textSecondary)}>
              Thanks for helping make Iskotify better. We&apos;ll look into it as soon as we can.
            </Text>
          </StatusPanel>
          <Button label="Done" onPress={() => goBackOr('/settings')} size="lg" fullWidth />
        </View>
      </InfoPage>
    )
  }

  return (
    <InfoPage title="Report a bug" lead="Found something broken? Tell us what happened and we'll fix it.">
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={textStyle('label', t.textPrimary)}>Where did it happen?</Text>
          <View accessibilityRole="radiogroup" accessibilityLabel="Where did it happen?" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {AREAS.map(a => (
              <FilterChip key={a} label={a} selected={area === a} onPress={() => setArea(a)} />
            ))}
          </View>
        </View>

        <TextField
          label="What happened?"
          hint="What did you tap, and what went wrong?"
          value={description}
          onChangeText={setDescription}
          placeholder="Describe the bug, e.g. the timer froze on question 12."
          multiline
        />

        {image ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Image
              source={{ uri: image.uri }}
              style={{ width: 56, height: 56, borderRadius: radius.sm, backgroundColor: t.surface2 }}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Attached screenshot"
            />
            <Text style={[textStyle('bodySm', t.textPrimary), { flex: 1 }]} numberOfLines={1}>{image.name}</Text>
            <Button label="Remove" variant="ghost" size="sm" accessibilityLabel="Remove screenshot" onPress={() => setImage(null)} />
          </View>
        ) : (
          <Button
            label="Attach a screenshot (optional)"
            variant="secondary"
            icon={<Lineicons icon={Camera1Outlined} size={18} color={t.accentText} />}
            onPress={() => void handleAttach()}
            fullWidth
          />
        )}

        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle('bodySm', t.danger)}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Send report"
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          loading={isSubmitting}
          size="lg"
          fullWidth
        />
      </View>
    </InfoPage>
  )
}
