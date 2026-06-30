import { useState, useMemo, useCallback } from 'react'
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { Card } from '../../components/ui/Card'
import { submitFeedback } from '../../services/appFeedback'

const STARS = [1, 2, 3, 4, 5] as const

export default function LeaveFeedbackScreen() {
  const { theme: t, typo } = useTheme()

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
      const ok = await submitFeedback({
        rating: rating > 0 ? rating : undefined,
        message,
      })
      if (ok) {
        setSuccessShown(true)
      } else {
        setError("We couldn't send your feedback. Please check your connection and try again.")
      }
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [rating, message])

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: { fontSize: typo.h2, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
    pageSub: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: typo.sm * 1.6, marginBottom: spacing.xl },
    label: { fontSize: typo.sm, fontWeight: '600' as const, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', marginBottom: spacing.sm },
    starsRow: { flexDirection: 'row' as const, gap: spacing.xs, marginBottom: spacing.lg },
    starBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    star: { fontSize: 30, lineHeight: 34, color: t.textTertiary },
    starOn: { color: '#fbbf24' },
    input: { backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', minHeight: 120, textAlignVertical: 'top' as const, borderCurve: 'continuous' as const, marginBottom: spacing.lg },
    errorText: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_400Regular', marginBottom: spacing.md, lineHeight: typo.xs * 1.5 },
    submitBtn: { backgroundColor: t.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' as const, justifyContent: 'center' as const, minHeight: 48, borderCurve: 'continuous' as const },
    submitTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: '#ffffff' },
    successTitle: { fontSize: typo.base, fontWeight: '700' as const, color: '#4ade80', fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    successBody: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: typo.sm * 1.6 },
    doneBtn: { backgroundColor: t.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' as const, marginTop: spacing.md, minHeight: 48, justifyContent: 'center' as const, borderCurve: 'continuous' as const },
    doneTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: '#ffffff' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <View style={s.backRow}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={s.backArrow}>‹</Text>
        </Pressable>
      </View>

      <ScreenScroll tabBarInset={false} padded>
        <Text style={s.pageTitle}>Leave Feedback</Text>

        {successShown ? (
          <Card elevated>
            <Text style={s.successTitle}>Thank you — salamat!</Text>
            <Text style={s.successBody}>
              Your feedback helps us make Iskotify better for every student.
            </Text>
            <Pressable
              style={({ pressed }) => [s.doneBtn, pressed && { opacity: 0.82 }]}
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={s.doneTxt}>Done</Text>
            </Pressable>
          </Card>
        ) : (
          <>
            <Text style={s.pageSub}>
              We'd love to hear what you think — what you like, or what we could do better.
            </Text>

            <Text style={s.label}>How would you rate Iskotify?</Text>
            <View style={s.starsRow} accessibilityRole="radiogroup" accessibilityLabel="Star rating">
              {STARS.map(n => {
                const on = n <= rating
                return (
                  <Pressable
                    key={n}
                    style={({ pressed }) => [s.starBtn, pressed && { opacity: 0.7 }]}
                    onPress={() => setRating(n)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}
                  >
                    <Text style={[s.star, on && s.starOn]} maxFontSizeMultiplier={1.4}>
                      {on ? '★' : '☆'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={s.label}>Your message</Text>
            <TextInput
              style={s.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Tell us what's on your mind…"
              placeholderTextColor={t.textTertiary}
              multiline
              maxFontSizeMultiplier={1.4}
              accessibilityLabel="Feedback message"
            />

            {error ? (
              <Text style={s.errorText} maxFontSizeMultiplier={1.4}>{error}</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [s.submitBtn, pressed && { opacity: 0.82 }, !canSubmit && { opacity: 0.5 }]}
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityLabel="Send feedback"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.submitTxt}>Send feedback</Text>
              )}
            </Pressable>
          </>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
