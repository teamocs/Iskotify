import { View } from 'react-native'
import { ChevronLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../../theme/ThemeContext'
import { radius, spacing } from '../../../theme/tokens'
import { Button } from '../../ui/Button'
import { PressableScale } from '../../ui/Pressable'
import { Text } from '../../ui/Text'
import { focusRing } from '../../ui/a11y'
import { GlassIconButton } from '../../navigation/GlassIconButton'

interface Labels {
  back?: string
  skip?: string
  next?: string
  review?: string
}

interface Props {
  isLast: boolean
  canGoBack: boolean
  /** The current question has an answer: the primary reads Next (else Skip). */
  answered: boolean
  /** submit() is in flight — every control goes inert. */
  submitting?: boolean
  onBack: () => void
  /** Moving on from an unanswered question. Defaults to onNext. */
  onSkip?: () => void
  onNext: () => void
  /** Opens the review sheet. The last question never submits directly. */
  onReview: () => void
  /** Opens the question overview. Omit when the side panel is already on screen. */
  onQuestions?: () => void
  /** Section-locked exams: the last question of a section finishes it instead. */
  lastInSection?: boolean
  onFinishSection?: () => void
  /** Spoken names, when a runner wants fuller ones than the visible words. */
  labels?: Labels
}

/**
 * The runner's bottom bar content (iOS redesign P4): Previous (a glass icon
 * circle) · Questions (gray) · the one primary action. The primary is Next
 * once the question is answered and Skip before; on the last question it is
 * Review, which opens the review sheet and never submits. A section-locked
 * exam's last question in a section reads Finish section.
 */
export function RunnerActions({
  isLast, canGoBack, answered, submitting = false, onBack, onSkip, onNext, onReview, onQuestions,
  lastInSection = false, onFinishSection, labels,
}: Props) {
  const { theme: t } = useTheme()

  let primary: { label: string; a11y?: string; onPress: () => void }
  if (isLast) primary = { label: 'Review', a11y: labels?.review, onPress: onReview }
  else if (lastInSection && onFinishSection) primary = { label: 'Finish section', onPress: onFinishSection }
  else if (answered) primary = { label: 'Next', a11y: labels?.next, onPress: onNext }
  else primary = { label: 'Skip', a11y: labels?.skip, onPress: onSkip ?? onNext }

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <GlassIconButton
        icon={ChevronLeftOutlined}
        accessibilityLabel={labels?.back ?? 'Previous question'}
        onPress={onBack}
        disabled={!canGoBack || submitting}
      />
      {onQuestions ? (
        <PressableScale
          onPress={onQuestions}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="All questions"
          aria-disabled={submitting}
          style={({ pressed, focused }) => [
            {
              minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.capsule,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? t.border : t.surface2,
            },
            focusRing(t.focusRing, focused),
          ]}
        >
          <Text role="headline" chrome>Questions</Text>
        </PressableScale>
      ) : null}
      <Button
        label={primary.label}
        accessibilityLabel={primary.a11y}
        disabled={submitting}
        onPress={primary.onPress}
        shape="pill"
        style={{ flexGrow: 1 }}
      />
    </View>
  )
}
