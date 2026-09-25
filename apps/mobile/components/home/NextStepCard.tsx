import { View, Text } from 'react-native'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { CheckCircle1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { ProgressBar } from '../ui/ProgressBar'
import { Skeleton } from '../ui/Skeleton'
import { ErrorState } from '../ui/ErrorState'
import { decorative } from '../ui/a11y'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import type { NextStep } from '../../utils/todayNextStep'

interface Props {
  step: NextStep
  onRetry: () => void
}

/**
 * The hero of Today (direction C, "One Next Step"): the single task to do now
 * and the screen's only maroon primary action. Everything else on Today
 * supports this card.
 */
export function NextStepCard({ step, onRetry }: Props) {
  const { theme: t } = useTheme()
  const compact = useBreakpoint() === 'compact'
  const progress = step.kind === 'task' ? `${step.done} of ${step.total} done today` : null

  return (
    <View testID="next-step" style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, minHeight: 32 }}>
        <Text accessibilityRole="header" style={[textStyle('titleSm', t.textPrimary), { flexShrink: 1 }]} maxFontSizeMultiplier={2}>
          Your next step
        </Text>
        {progress ? (
          <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{progress}</Text>
        ) : null}
      </View>

      <Card elevated style={{ padding: spacing.xl, gap: spacing.md }}>
        {step.kind === 'loading' ? (
          <View style={{ gap: spacing.md }}>
            <Skeleton accessible label="Loading your next step" width="70%" height={28} />
            <Skeleton width="90%" height={16} />
            <Skeleton width={compact ? '100%' : 200} height={52} radius={radius.lg} />
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
              <Text style={textStyle('title', t.textPrimary)} maxFontSizeMultiplier={1.6}>{step.title}</Text>
              <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>{step.detail}</Text>
            </View>
            <ProgressBar value={step.done / step.total} label="Today's plan progress" tone="success" />
            <Button
              label={step.actionLabel}
              accessibilityLabel={`${step.actionLabel}, ${step.title}`}
              size="lg"
              fullWidth={compact}
              onPress={() => router.push(step.route as never)}
            />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View
                {...decorative}
                style={{
                  width: 48, height: 48, borderRadius: radius.pill, backgroundColor: t.successSurface,
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Lineicons icon={CheckCircle1Outlined} size={24} color={t.successStrong} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: spacing.xs }}>
                <Text style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.6}>
                  {step.reason === 'complete' ? 'Tapos na for today' : 'Nothing due right now'}
                </Text>
                <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
                  {doneBody(step.reason, step.tomorrowCount)}
                </Text>
              </View>
            </View>
            <Button
              label="Practice anyway"
              variant={step.reason === 'complete' ? 'secondary' : 'primary'}
              fullWidth={compact}
              onPress={() => router.push('/(tabs)/practice')}
            />
          </>
        )}
      </Card>
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
