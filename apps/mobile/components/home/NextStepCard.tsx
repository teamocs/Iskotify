import { View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { ErrorState } from '../ui/ErrorState'
import { Text } from '../ui/Text'
import { heading } from '../ui/a11y'
import type { NextStep } from '../../utils/todayNextStep'

interface Props {
  step: NextStep
  onRetry: () => void
}

/** The finished-plan line (brandbook: English, calm, forward-looking). */
export const DONE_FOR_TODAY = "That's today done. See you tomorrow."

/**
 * The hero of Today (direction C, "One Next Step"): a white card (22pt
 * radius, shadowSm) naming the single task to do now, with the screen's only
 * maroon primary action. Eyebrow "One next step" and a time estimate, the
 * task in title2, a one-line reason, then one full-width button.
 */
export function NextStepCard({ step, onRetry }: Props) {
  const { theme: t } = useTheme()
  const estimate = step.kind === 'task' && step.minutes != null ? `About ${step.minutes} min` : null

  return (
    <View
      testID="next-step"
      style={{
        backgroundColor: t.surface,
        borderRadius: radius.card,
        borderCurve: 'continuous',
        boxShadow: t.shadowSm,
        padding: spacing.xl,
        gap: spacing.md,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <Text role="footnote" color={t.textSecondary} {...heading(2)} style={{ flexShrink: 1, fontWeight: '600' }}>
          One next step
        </Text>
        {estimate ? <Text role="footnote" color={t.textSecondary}>{estimate}</Text> : null}
      </View>

      {step.kind === 'loading' ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton accessible label="Loading your next step" width="70%" height={28} />
          <Skeleton width="90%" height={16} />
          <Skeleton height={52} radius={radius.button} />
        </View>
      ) : step.kind === 'error' ? (
        <ErrorState
          title="Couldn't load today's plan"
          body="Check your connection, then try again. Your saved progress is safe."
          onRetry={onRetry}
        />
      ) : step.kind === 'task' ? (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text role="title2">{step.title}</Text>
            <Text role="subheadline" color={t.textSecondary}>{step.detail}</Text>
          </View>
          <Button
            label={step.actionLabel}
            accessibilityLabel={`${step.actionLabel}, ${step.title}`}
            size="lg"
            fullWidth
            onPress={() => router.push(step.route as never)}
          />
        </>
      ) : (
        <>
          <View style={{ gap: spacing.xs }}>
            <Text role="title2">{step.reason === 'complete' ? DONE_FOR_TODAY : 'Nothing due right now'}</Text>
            <Text role="subheadline" color={t.textSecondary}>{doneBody(step.reason, step.tomorrowCount)}</Text>
          </View>
          {/* Finished: a quiet secondary, so "see you tomorrow" is not undercut by a maroon push. */}
          <Button
            label="Practice anyway"
            variant={step.reason === 'complete' ? 'secondary' : 'primary'}
            size="lg"
            fullWidth
            onPress={() => router.push('/(tabs)/practice')}
          />
        </>
      )}
    </View>
  )
}

function doneBody(reason: 'complete' | 'empty', tomorrow: number): string {
  if (reason === 'complete') {
    return tomorrow > 0
      ? `Come back tomorrow for ${tomorrow} more item${tomorrow === 1 ? '' : 's'}.`
      : 'Come back tomorrow for your next plan.'
  }
  return tomorrow > 0
    ? `You're ahead. ${tomorrow} item${tomorrow === 1 ? '' : 's'} will be due tomorrow.`
    : "You're ahead of your plan. A short set keeps the streak going."
}
