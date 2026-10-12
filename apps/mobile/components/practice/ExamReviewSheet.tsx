import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { confirmAction } from '../../utils/confirmAction'
import { Sheet } from '../ui/Sheet'
import { Button } from '../ui/Button'
import { Text } from '../ui/Text'
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
  /** First index of a later, not-yet-open section (section-locked exams). */
  ceilIdx?: number
  /** When set, 'Submit exam' is disabled and this reason is shown (e.g. nothing answered yet). */
  submitBlockedMessage?: string
}

/**
 * Fix 2 (exam safety) — replaces the last-question "Review" button that used
 * to call submit() directly. Lists every question's answered/unanswered/
 * flagged state, lets the student jump to any of them, and gates the actual
 * submit behind an explicit confirmation that names the unanswered count.
 * Shared by every timed runner (mock exam, UPCAT subtest, diagnostic,
 * flashcard quiz) so "never submits directly" holds everywhere at once.
 *
 * iOS redesign P4: built on the P3 Sheet, so it inherits the full modal
 * contract (bottom sheet on phones, centred dialog from medium up, glass
 * header with the title as a header, Back/Escape close, screen-reader focus
 * moved to the title on native, the web focus trap starting at Close with the
 * summary next in reading order, spring.smooth enter and a 220ms exit, a
 * crossfade under Reduce Motion). Submit stays in the sticky footer.
 */
export function ExamReviewSheet({
  visible, total, currentIdx, answeredIdxs, flaggedIdxs, onJump, onClose, onSubmit,
  sections, onJumpSection, floorIdx = 0, ceilIdx, submitBlockedMessage,
}: ExamReviewSheetProps) {
  const { theme: t } = useTheme()

  const unansweredCount = total - answeredIdxs.size
  const summary = unansweredCount === 0
    ? 'All questions answered.'
    : `${unansweredCount} unanswered.`

  function requestSubmit() {
    if (submitBlockedMessage) return
    const message = unansweredCount === 0
      ? 'All questions answered. Once submitted you can’t change your answers.'
      : `You have ${unansweredCount} unanswered question${unansweredCount === 1 ? '' : 's'}. Once submitted you can’t change your answers.`
    confirmAction('Submit exam?', message, 'Submit', onSubmit, {
      cancelLabel: 'Keep reviewing',
      destructive: unansweredCount > 0,
    })
  }

  const footer = (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      <Button label="Back to exam" variant="secondary" onPress={onClose} />
      <Button label="Submit exam" onPress={requestSubmit} disabled={!!submitBlockedMessage} style={{ flexGrow: 1 }} />
    </View>
  )

  return (
    <Sheet visible={visible} title="Review your answers" onClose={onClose} footer={footer}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.xs }}>
          <Text role="subheadline" color={t.textSecondary} accessibilityLiveRegion="polite" maxFontSizeMultiplier={1.6}>
            {summary}
          </Text>
          {submitBlockedMessage ? (
            <Text role="subheadline" maxFontSizeMultiplier={1.6}>{submitBlockedMessage}</Text>
          ) : null}
        </View>
        {sections && sections.length > 1 && onJumpSection ? (
          <View style={{ gap: spacing.sm }}>
            <Text role="footnote" color={t.textSecondary} accessibilityRole="header" maxFontSizeMultiplier={1.6}>Sections</Text>
            <SectionGrid sections={sections} onJump={start => { onJumpSection(start); onClose() }} />
          </View>
        ) : null}
        <QuestionGrid
          total={total}
          currentIdx={currentIdx}
          answeredIdxs={answeredIdxs}
          flaggedIdxs={flaggedIdxs}
          floorIdx={floorIdx}
          ceilIdx={ceilIdx}
          onPressCell={i => { onJump(i); onClose() }}
        />
      </View>
    </Sheet>
  )
}
