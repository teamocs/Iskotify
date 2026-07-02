import { useState, useMemo, useCallback } from 'react'
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useTheme } from '../theme/ThemeContext'
import { spacing, radius, type Theme, type Typography } from '../theme/tokens'
import { submitDateContribution, type ContribField } from '../services/dateContributions'

interface Props {
  visible: boolean
  onClose: () => void
  listingSlug: string
}

const FIELDS: { key: ContribField; label: string }[] = [
  { key: 'exam_date', label: 'Exam date' },
  { key: 'deadline', label: 'Application deadline' },
  { key: 'results_date', label: 'Results date' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Themed modal that lets a signed-in user suggest a correction to a listing's
 * key dates. Rendered on both native and web (RN Modal overlays on web). Inner
 * form only mounts while visible so state resets cleanly on every open.
 */
export function SuggestDateCorrectionModal({ visible, onClose, listingSlug }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      {visible ? (
        <SuggestDateCorrectionInner listingSlug={listingSlug} onClose={onClose} />
      ) : null}
    </Modal>
  )
}

function SuggestDateCorrectionInner({ listingSlug, onClose }: { listingSlug: string; onClose: () => void }) {
  const { theme: t, typo } = useTheme()
  const [field, setField] = useState<ContribField>('exam_date')
  const [date, setDate] = useState('')
  const [note, setNote] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsAuth, setNeedsAuth] = useState(false)

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  // Inline format hint: only once the user has typed something malformed.
  const formatInvalid = date.length > 0 && !DATE_RE.test(date)
  const canSubmit = DATE_RE.test(date) && !submitting

  const handleSubmit = useCallback(async () => {
    if (!DATE_RE.test(date)) {
      setError('Enter a valid date')
      return
    }
    setError(null)
    setNeedsAuth(false)
    setSubmitting(true)
    const res = await submitDateContribution({
      listingSlug,
      field,
      date,
      note: note.trim() || undefined,
      sourceUrl: sourceUrl.trim() || undefined,
    })
    setSubmitting(false)

    if (res.ok) {
      onClose()
      Alert.alert(
        'Thanks — salamat!',
        "Your suggested date was sent for review. We'll double-check it against the official source.",
      )
      return
    }
    if (res.needsAuth) {
      setNeedsAuth(true)
      setError(res.error)
      return
    }
    setError(res.error)
  }, [date, field, note, sourceUrl, listingSlug, onClose])

  const goSignIn = useCallback(() => {
    onClose()
    router.push('/auth/sign-in')
  }, [onClose])

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            Suggest a correction
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={({ pressed }) => [s.closeBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={s.closeTxt}>✕</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={s.intro} maxFontSizeMultiplier={1.4}>
            Spotted a wrong date? Suggest the correct one and we&apos;ll review it against the
            official source.
          </Text>

          {/* Field selector */}
          <Text style={s.label} maxFontSizeMultiplier={1.4}>Which date?</Text>
          <View
            style={s.fieldRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="Which date to correct"
          >
            {FIELDS.map(f => {
              const selected = field === f.key
              return (
                <Pressable
                  key={f.key}
                  onPress={() => setField(f.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={f.label}
                  style={({ pressed }) => [
                    s.fieldChip,
                    selected && s.fieldChipOn,
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text
                    style={[s.fieldChipTxt, selected && s.fieldChipTxtOn]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {f.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Date entry */}
          <Text style={s.label} maxFontSizeMultiplier={1.4}>Correct date</Text>
          <TextInput
            style={[s.input, formatInvalid && s.inputError]}
            value={date}
            onChangeText={(v) => { setDate(v); if (error) setError(null) }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
            maxLength={10}
            maxFontSizeMultiplier={1.4}
            accessibilityLabel="Correct date, format year month day"
          />
          {formatInvalid ? (
            <Text style={s.hint} maxFontSizeMultiplier={1.4}>Use the format YYYY-MM-DD (e.g. 2026-08-15).</Text>
          ) : null}

          {/* Optional note */}
          <Text style={s.label} maxFontSizeMultiplier={1.4}>Note (optional)</Text>
          <TextInput
            style={[s.input, s.multiline]}
            value={note}
            onChangeText={setNote}
            placeholder="Where did you see this date?"
            placeholderTextColor={t.textTertiary}
            multiline
            maxFontSizeMultiplier={1.4}
            accessibilityLabel="Note about this correction"
          />

          {/* Optional source URL */}
          <Text style={s.label} maxFontSizeMultiplier={1.4}>Source link (optional)</Text>
          <TextInput
            style={s.input}
            value={sourceUrl}
            onChangeText={setSourceUrl}
            placeholder="https://…"
            placeholderTextColor={t.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            maxFontSizeMultiplier={1.4}
            accessibilityLabel="Source link for this correction"
          />

          {error ? (
            <Text style={s.errorTxt} maxFontSizeMultiplier={1.4}>{error}</Text>
          ) : null}

          {needsAuth ? (
            <Pressable
              onPress={goSignIn}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={({ pressed }) => [s.signInBtn, pressed && { opacity: 0.82 }]}
            >
              <Text style={s.signInTxt} maxFontSizeMultiplier={1.4}>Sign in</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void handleSubmit()}
              disabled={!canSubmit}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSubmit }}
              accessibilityLabel="Submit suggestion"
              style={({ pressed }) => [
                s.submitBtn,
                pressed && { opacity: 0.82 },
                !canSubmit && { opacity: 0.5 },
              ]}
            >
              {submitting ? (
                <ActivityIndicator color={t.textInverse} />
              ) : (
                <Text style={s.submitTxt} maxFontSizeMultiplier={1.4}>Submit suggestion</Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function makeStyles(t: Theme, typo: Typography) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    flex: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: t.divider,
      gap: spacing.sm,
    },
    headerTitle: {
      flex: 1,
      fontSize: typo.md,
      fontFamily: 'Outfit_700Bold',
      color: t.textPrimary,
    },
    closeBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8 },
    closeTxt: { fontSize: 22, color: t.textSecondary },
    body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xxxl, gap: spacing.sm },
    intro: {
      fontSize: typo.sm,
      color: t.textSecondary,
      fontFamily: 'Lexend_400Regular',
      lineHeight: typo.sm * 1.6,
      marginBottom: spacing.sm,
    },
    label: {
      fontSize: typo.sm,
      fontWeight: '600',
      color: t.textPrimary,
      fontFamily: 'Lexend_600SemiBold',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    fieldChip: {
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      minHeight: 44,
      justifyContent: 'center',
    },
    fieldChipOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    fieldChipTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    fieldChipTxtOn: { color: t.accentText, fontFamily: 'Lexend_600SemiBold' },
    input: {
      backgroundColor: t.surfaceSubtle,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontSize: typo.sm,
      color: t.textPrimary,
      fontFamily: 'Lexend_400Regular',
      minHeight: 48,
    },
    inputError: { borderColor: t.danger },
    multiline: { minHeight: 88, textAlignVertical: 'top' },
    hint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    errorTxt: {
      fontSize: typo.xs,
      color: t.danger,
      fontFamily: 'Lexend_400Regular',
      marginTop: spacing.md,
      lineHeight: typo.xs * 1.5,
    },
    submitBtn: {
      backgroundColor: t.accentStrong,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      marginTop: spacing.lg,
    },
    submitTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
    signInBtn: {
      backgroundColor: t.accentStrong,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 48,
      marginTop: spacing.md,
    },
    signInTxt: { fontFamily: 'Outfit_700Bold', fontSize: typo.base, color: t.textInverse },
  })
}
