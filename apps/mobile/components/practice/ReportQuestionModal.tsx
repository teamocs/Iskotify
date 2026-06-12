import { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, Pressable, TextInput, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'

const PRESET_REASONS = [
  'Wrong answer',
  'Typo or formatting issue',
  'Question is unclear',
  'Other',
] as const

interface Props {
  visible: boolean
  onClose: () => void
  onSubmit: (reason: string) => void
}

/**
 * Bottom-sheet style report dialog shared by all practice runners.
 * Submits `preset` or `preset — details` when optional details are typed.
 * State resets every time the sheet is reopened.
 */
export function ReportQuestionModal({ visible, onClose, onSubmit }: Props) {
  const { theme: t, typo } = useTheme()
  const [selected, setSelected] = useState<string | null>(null)
  const [details, setDetails] = useState('')

  // Reset prior selection/details whenever the sheet is reopened.
  useEffect(() => {
    if (visible) {
      setSelected(null)
      setDetails('')
    }
  }, [visible])

  const s = useMemo(() => makeStyles(t, typo), [t, typo])

  function handleSubmit() {
    if (!selected) return
    const extra = details.trim()
    onSubmit(extra ? `${selected} — ${extra}` : selected)
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <View style={s.handle} />
          <Text style={s.title} maxFontSizeMultiplier={1.4}>Report this question</Text>

          {PRESET_REASONS.map(reason => {
            const on = selected === reason
            return (
              <Pressable
                key={reason}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[s.reasonRow, on && s.reasonRowOn]}
                onPress={() => setSelected(reason)}
              >
                <View style={[s.radio, on && s.radioOn]} />
                <Text style={[s.reasonTxt, on && s.reasonTxtOn]} maxFontSizeMultiplier={1.4}>
                  {reason}
                </Text>
              </Pressable>
            )
          })}

          <TextInput
            style={s.detailsInput}
            placeholder="Add details (optional)"
            placeholderTextColor={t.textTertiary}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={300}
            maxFontSizeMultiplier={1.4}
          />

          <View style={s.btnRow}>
            <Pressable accessibilityRole="button" style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelTxt} maxFontSizeMultiplier={1.4}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !selected }}
              style={[s.submitBtn, !selected && s.submitDisabled]}
              disabled={!selected}
              onPress={handleSubmit}
            >
              <Text style={s.submitTxt} maxFontSizeMultiplier={1.4}>Submit</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

function makeStyles(
  t: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['theme'],
  typo: ReturnType<typeof import('../../theme/ThemeContext').useTheme>['typo'],
) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: t.bg,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderCurve: 'continuous',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xl,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: spacing.sm },
    title: {
      fontSize: typo.lg,
      fontWeight: '700',
      color: t.textPrimary,
      fontFamily: 'Outfit_700Bold',
      marginBottom: spacing.md,
    },
    reasonRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 44,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1.5,
      borderColor: t.border,
      backgroundColor: t.surface,
      marginBottom: spacing.xs,
    },
    reasonRowOn: { backgroundColor: t.accentSurface, borderColor: t.accent },
    radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: t.border },
    radioOn: { borderColor: t.accent, backgroundColor: t.accent },
    reasonTxt: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    reasonTxtOn: { fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
    detailsInput: {
      minHeight: 64,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: t.surface,
      color: t.textPrimary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: typo.sm,
      fontFamily: 'Lexend_400Regular',
      textAlignVertical: 'top',
      marginTop: spacing.xs,
    },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    cancelBtn: {
      minHeight: 44,
      paddingHorizontal: spacing.lg,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    submitBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: radius.md,
      borderCurve: 'continuous',
      backgroundColor: 'rgba(128,0,0,0.85)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    submitDisabled: { opacity: 0.4 },
    submitTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  })
}
