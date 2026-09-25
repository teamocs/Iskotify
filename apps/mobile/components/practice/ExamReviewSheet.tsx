import { useEffect, useRef } from 'react'
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, AccessibilityInfo, Platform, findNodeHandle } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius, textStyle } from '../../theme/tokens'
import { confirmAction } from '../../utils/confirmAction'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { sheetPresentation } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { decorative } from '../ui/a11y'
import { QuestionGrid } from './QuestionGrid'
import { SectionGrid, type SectionGridSection } from './SectionGrid'

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
  /** Optional section jumper (mock runner) — moved here from the exam header in M2. */
  sections?: SectionGridSection[]
  onJumpSection?: (start: number) => void
  /** Questions before this index are locked by an expired section timer. */
  floorIdx?: number
}

/**
 * Fix 2 (exam safety) — replaces the last-question "Review" button that used
 * to call submit() directly. Lists every question's answered/unanswered/
 * flagged state, lets the student jump to any of them, and gates the actual
 * submit behind an explicit confirmation that names the unanswered count.
 * Shared by every timed runner (mock exam, UPCAT subtest, diagnostic,
 * flashcard quiz) so "never submits directly" holds everywhere at once.
 *
 * Redesign M2: tokens only, a bottom sheet on phones and a centred dialog from
 * medium widths (same rule as the Sheet primitive), 48pt question cells with
 * non-colour state marks, and an optional section jumper.
 */
export function ExamReviewSheet({
  visible, total, currentIdx, answeredIdxs, flaggedIdxs, onJump, onClose, onSubmit,
  sections, onJumpSection, floorIdx = 0,
}: ExamReviewSheetProps) {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const reduced = useReducedMotion()
  const insets = useSafeInsets()
  const bottom = sheetPresentation(bp) === 'bottom'
  const titleRef = useRef<Text>(null)

  // Review finding #4: move accessibility focus onto the title every time the
  // sheet opens — otherwise a screen reader user's focus stays wherever it
  // was on the exam screen behind this full-screen modal.
  // Native only: react-native-web's findNodeHandle THROWS (and took the whole
  // app down on web when this sheet opened). On web, RNW's Modal moves focus
  // into the dialog and traps it.
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
    <Modal visible={visible} transparent animationType={reduced ? 'none' : 'fade'} statusBarTranslucent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          justifyContent: bottom ? 'flex-end' : 'center',
          alignItems: bottom ? 'stretch' : 'center',
          padding: bottom ? 0 : spacing.xxl,
        }}
      >
        <View
          accessibilityViewIsModal
          style={{
            zIndex: 1,
            width: '100%',
            maxWidth: bottom ? undefined : 560,
            maxHeight: bottom ? '88%' : '85%',
            backgroundColor: t.surfaceRaised,
            borderTopLeftRadius: radius.xxl,
            borderTopRightRadius: radius.xxl,
            borderBottomLeftRadius: bottom ? 0 : radius.xxl,
            borderBottomRightRadius: bottom ? 0 : radius.xxl,
            borderCurve: 'continuous',
            paddingHorizontal: spacing.xl,
            paddingTop: bottom ? spacing.sm : spacing.xl,
            paddingBottom: (bottom ? insets.bottom : 0) + spacing.xl,
            boxShadow: t.shadowMd,
          }}
        >
          {bottom ? (
            <View
              {...decorative}
              style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radius.pill, backgroundColor: t.divider, marginBottom: spacing.md }}
            />
          ) : null}
          <Text ref={titleRef} style={textStyle('headline', t.textPrimary)} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            Review your answers
          </Text>
          <Text style={[textStyle('bodySm', t.textSecondary), { marginTop: 2, marginBottom: spacing.lg }]} maxFontSizeMultiplier={1.4}>
            {summary}
          </Text>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.sm }} showsVerticalScrollIndicator={false}>
            {sections && sections.length > 1 && onJumpSection ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={textStyle('label', t.textSecondary)} maxFontSizeMultiplier={1.4}>Sections</Text>
                <SectionGrid sections={sections} onJump={start => { onJumpSection(start); onClose() }} />
              </View>
            ) : null}
            <QuestionGrid
              total={total}
              currentIdx={currentIdx}
              answeredIdxs={answeredIdxs}
              flaggedIdxs={flaggedIdxs}
              floorIdx={floorIdx}
              onPressCell={i => { onJump(i); onClose() }}
            />
          </ScrollView>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg }}>
            <Button label="Back to exam" variant="secondary" onPress={onClose} />
            <Button label="Submit exam" onPress={requestSubmit} style={{ flexGrow: 1 }} />
          </View>
        </View>
        <Pressable
          onPress={onClose}
          accessible={false}
          focusable={false}
          tabIndex={-1}
          {...decorative}
          style={[StyleSheet.absoluteFill, { backgroundColor: t.backdrop }]}
        />
      </View>
    </Modal>
  )
}
