import { useState, useCallback } from 'react'
import { View, Text, Pressable } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { StarFatOutlined, StarFatSolid } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { InfoPage } from '../../components/info/InfoPage'
import { StatusPanel } from '../../components/auth/AuthLayout'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { goBackOr } from '../../components/explore/DetailTopBar'
import { submitFeedback } from '../../services/appFeedback'

const STARS = [1, 2, 3, 4, 5] as const
const RATING_WORDS = ['', 'Needs a lot of work', 'Could be better', 'Okay', 'Good', 'Love it'] as const

export default function LeaveFeedbackScreen() {
  const { theme: t } = useTheme()

  const [rating, setRating] = useState(0)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successShown, setSuccessShown] = useState(false)

  const canSubmit = message.trim().length > 0 && !isSubmitting

  const handleSubmit = useCallback(async () => {
    if (message.trim().length === 0) return
    setError(null)
    setIsSubmitting(true)
    try {
      const ok = await submitFeedback({ rating: rating > 0 ? rating : undefined, message })
      if (ok) setSuccessShown(true)
      else setError("We couldn't send your feedback. Check your connection and try again; your message is still here.")
    } catch {
      setError('Something went wrong. Please try again; your message is still here.')
    } finally {
      setIsSubmitting(false)
    }
  }, [rating, message])

  if (successShown) {
    return (
      <InfoPage title="Leave feedback">
        <View style={{ gap: spacing.lg }}>
          <StatusPanel tone="success" title="Salamat! We got your feedback.">
            <Text style={textStyle('bodySm', t.textSecondary)}>It helps us make Iskotify better for every student.</Text>
          </StatusPanel>
          <Button label="Done" onPress={() => goBackOr('/settings')} size="lg" fullWidth />
        </View>
      </InfoPage>
    )
  }

  return (
    <InfoPage
      title="Leave feedback"
      lead="What do you like, and what could we do better? We read every message."
    >
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text style={textStyle('label', t.textPrimary)}>How would you rate Iskotify? (optional)</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Rating"
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginLeft: -spacing.sm }}
          >
            {STARS.map(n => {
              const filled = n <= rating
              return (
                <Pressable
                  key={n}
                  onPress={() => setRating(n)}
                  accessibilityRole="radio"
                  accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                  aria-checked={rating === n}
                  style={(state) => {
                    const { pressed, hovered, focused } = state as WebPressableState
                    return [{
                      width: 48, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: pressed || hovered ? t.surface2 : 'transparent',
                    }, focusRing(t.focusRing, focused)]
                  }}
                >
                  <View {...decorative}>
                    <Lineicons icon={filled ? StarFatSolid : StarFatOutlined} size={28} color={filled ? t.warning : t.inputBorder} />
                  </View>
                </Pressable>
              )
            })}
          </View>
          {rating > 0 ? (
            <Text style={textStyle('bodySm', t.textSecondary)}>{`${rating} of 5: ${RATING_WORDS[rating]}`}</Text>
          ) : null}
        </View>

        <TextField
          label="Your message"
          value={message}
          onChangeText={setMessage}
          placeholder="e.g. The mock exams helped, but I want more Filipino questions."
          multiline
        />

        {error ? (
          <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={textStyle('bodySm', t.danger)}>
            {error}
          </Text>
        ) : null}

        <Button
          label="Send feedback"
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
