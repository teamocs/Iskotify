import { useEffect, useMemo, useRef } from 'react'
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, AccessibilityInfo, Platform, findNodeHandle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { confirmAction } from '../../utils/confirmAction'

interface ExamReviewSheetProps {
  visible: boolean
  total: number
  currentIdx: number
  answeredIdxs: Set<number>
  /** Reported/flagged question indexes — optional (not every runner has reporting). */
  flaggedIdxs?: Set<number>
  onJump: (idx: number) => void
  onClose: () => void
  onSubmit: () => void
}

/**
 * Fix 2 (exam safety) — replaces the last-question "Review" button that used
 * to call submit() directly. Lists every question's answered/unanswered/
 * flagged state, lets the student jump to any of them, and gates the actual
 * submit behind an explicit confirmation that names the unanswered count.
 * Shared by every timed runner (mock exam, UPCAT subtest, diagnostic,
 * flashcard quiz) so "never submits directly" holds everywhere at once.
 */
export function ExamReviewSheet({
  visible, total, currentIdx, answeredIdxs, flaggedIdxs, onJump, onClose, onSubmit,
}: ExamReviewSheetProps) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => makeStyles(t, typo), [t, typo])
  const titleRef = useRef<Text>(null)

  // Review finding #4: move accessibility focus onto the title every time the
  // sheet opens — otherwise a screen reader user's focus stays wherever it
  // was on the exam screen behind this full-screen modal.
  // Native only: react-native-web's findNodeHandle throws, which unmounted the
  // whole app when the sheet opened. On web, RNW's Modal moves focus in itself.
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return
    const handle = findNodeHandle(titleRef.current)
    AccessibilityInfo.setAccessibilityFocus(handle ?? 0)
  }, [visible])

  const unansweredCount = total - answeredIdxs.size
  const summary = unansweredCount === 0
    ? 'All questions answered.'
    : `${unansweredCount} unanswered.`

  function requestSubmit() {
    const message = unansweredCount === 0
      ? 'All questions answered. Once submitted you can’t change your answers.'
      : `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Once submitted you can’t change your answers.`
    confirmAction('Submit exam?', message, 'Submit', onSubmit, {
      cancelLabel: 'Keep reviewing',
      destructive: unansweredCount > 0,
    })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet} accessibilityViewIsModal>
          <View style={s.handle} />
          <Text
            ref={titleRef}
            style={s.title}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.4}
          >
            Review your answers
          </Text>
          <Text style={s.summary} maxFontSizeMultiplier={1.4}>{summary}</Text>

          <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
            {Array.from({ length: total }, (_, i) => {
              const answered = answeredIdxs.has(i)
              const flagged = !!flaggedIdxs?.has(i)
              const current = i === currentIdx
              const label = `Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}${flagged ? ', flagged' : ''}`
              return (
                <Pressable
                  key={i}
                  style={[s.cell, answered && s.cellAnswered, flagged && s.cellFlagged, current && s.cellCurrent]}
                  onPress={() => { onJump(i); onClose() }}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                >
                  <Text style={[s.cellTxt, answered && s.cellTxtAnswered]}>{i + 1}</Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={s.btnRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to exam"
              style={s.ghostBtn}
              onPress={onClose}
            >
              <Text style={s.ghostTxt}>Back to exam</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit exam"
              style={s.submitBtn}
              onPress={requestSubmit}
            >
              <Text style={s.submitTxt}>Submit exam</Text>
            </Pressable>
          </View>
        </View>
      </View>
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
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      maxHeight: '80%',
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: spacing.sm },
    title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    summary: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginTop: 2, marginBottom: spacing.md },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: spacing.sm },
    cell: {
      width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous',
      alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2,
    },
    cellAnswered: { backgroundColor: t.accentSurface, borderColor: t.accent },
    cellFlagged: { borderColor: t.warningStrong, borderWidth: 2 },
    cellCurrent: { borderColor: t.accentText, borderWidth: 2 },
    cellTxt: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    cellTxtAnswered: { color: t.accentText },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    ghostBtn: {
      minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.md, borderCurve: 'continuous',
      borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center',
    },
    ghostTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    submitBtn: {
      flex: 1, minHeight: 44, borderRadius: radius.md, borderCurve: 'continuous',
      backgroundColor: t.accentStrong, alignItems: 'center', justifyContent: 'center',
    },
    submitTxt: { fontSize: typo.md, fontWeight: '700', color: t.textInverse, fontFamily: 'Outfit_700Bold' },
  })
}
