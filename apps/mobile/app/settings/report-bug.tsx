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
import * as DocumentPicker from 'expo-document-picker'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { Card } from '../../components/ui/Card'
import { submitBugReport } from '../../services/appFeedback'

// Lightweight area picker — covers the app's main surfaces; "General" is the
// default so a user never has to pick one to file a report.
const AREAS = ['General', 'Home', 'Review', 'Exams', 'Ask Kuya Baw', 'Updates', 'Settings'] as const

interface PickedImage {
  uri: string
  name: string
}

export default function ReportBugScreen() {
  const { theme: t, typo } = useTheme()

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
      if (asset?.uri) {
        setImage({ uri: asset.uri, name: asset.name ?? 'screenshot' })
      }
    } catch {
      // Picker failures are non-fatal — the user can still file a text report.
    }
  }, [])

  const handleRemoveImage = useCallback(() => setImage(null), [])

  const handleSubmit = useCallback(async () => {
    if (description.trim().length === 0) return
    setError(null)
    setIsSubmitting(true)
    try {
      const ok = await submitBugReport({
        screen: area,
        description,
        imageUri: image?.uri,
      })
      if (ok) {
        setSuccessShown(true)
      } else {
        setError("We couldn't send your report. Please check your connection and try again.")
      }
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [area, description, image])

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.xs },
    backBtn: { width: 44, height: 44, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    pageTitle: { fontSize: typo.h2, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: spacing.sm },
    pageSub: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: typo.sm * 1.6, marginBottom: spacing.xl },
    label: { fontSize: typo.sm, fontWeight: '600' as const, color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', marginBottom: spacing.sm },
    chipRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm, marginBottom: spacing.lg },
    chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceSubtle, minHeight: 38, justifyContent: 'center' as const, borderCurve: 'continuous' as const },
    chipOn: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    chipTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_500Medium' },
    chipTxtOn: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    input: { backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', minHeight: 120, textAlignVertical: 'top' as const, borderCurve: 'continuous' as const, marginBottom: spacing.lg },
    attachBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: spacing.sm, backgroundColor: t.surfaceSubtle, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' as const, paddingVertical: 14, minHeight: 48, marginBottom: spacing.lg, borderCurve: 'continuous' as const },
    attachTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    thumbRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.md, marginBottom: spacing.lg },
    thumb: { width: 48, height: 48, borderRadius: radius.sm, backgroundColor: t.surface2, borderCurve: 'continuous' as const },
    thumbName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    removeLink: { paddingVertical: 8, paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' as const },
    removeLinkTxt: { fontSize: typo.sm, color: '#f87171', fontFamily: 'Lexend_600SemiBold' },
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
        <Text style={s.pageTitle}>Report a Bug</Text>

        {successShown ? (
          <Card elevated>
            <Text style={s.successTitle}>Report sent — salamat!</Text>
            <Text style={s.successBody}>
              Thanks for helping us make Iskotify better. We'll take a look as soon as we can.
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
              Found something broken? Tell us what happened and we'll fix it.
            </Text>

            <Text style={s.label}>Where did it happen?</Text>
            <View style={s.chipRow}>
              {AREAS.map(a => {
                const on = area === a
                return (
                  <Pressable
                    key={a}
                    style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.7 }]}
                    onPress={() => setArea(a)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`Area: ${a}`}
                  >
                    <Text style={[s.chipTxt, on && s.chipTxtOn]} maxFontSizeMultiplier={1.4}>{a}</Text>
                  </Pressable>
                )
              })}
            </View>

            <Text style={s.label}>What happened?</Text>
            <TextInput
              style={s.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe the bug — what did you do, and what went wrong?"
              placeholderTextColor={t.textTertiary}
              multiline
              maxFontSizeMultiplier={1.4}
              accessibilityLabel="Bug description"
            />

            {image ? (
              <View style={s.thumbRow}>
                <View style={s.thumb} />
                <Text style={s.thumbName} numberOfLines={1} maxFontSizeMultiplier={1.4}>{image.name}</Text>
                <Pressable
                  style={({ pressed }) => [s.removeLink, pressed && { opacity: 0.7 }]}
                  onPress={handleRemoveImage}
                  accessibilityRole="button"
                  accessibilityLabel="Remove screenshot"
                >
                  <Text style={s.removeLinkTxt}>Remove</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [s.attachBtn, pressed && { opacity: 0.7 }]}
                onPress={() => void handleAttach()}
                accessibilityRole="button"
                accessibilityLabel="Attach screenshot"
              >
                <Text style={s.attachTxt} maxFontSizeMultiplier={1.4}>+ Attach screenshot (optional)</Text>
              </Pressable>
            )}

            {error ? (
              <Text style={s.errorText} maxFontSizeMultiplier={1.4}>{error}</Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [s.submitBtn, pressed && { opacity: 0.82 }, !canSubmit && { opacity: 0.5 }]}
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityLabel="Submit report"
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={s.submitTxt}>Submit report</Text>
              )}
            </Pressable>
          </>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
