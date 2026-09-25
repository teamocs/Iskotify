import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import type { NextPracticeCopy } from '../../utils/nextPracticeAction'

interface Props {
  /** Null while the inputs load. */
  copy: NextPracticeCopy | null
  onAction: (href: string) => void
}

/**
 * Direction C's "one next step": the only maroon action on the Practice tab.
 * The heading IS the action ("Review 7 due cards"), a single line says why,
 * and one button does it. No eyebrow, no stats: the lists below carry those.
 */
export function NextStepCard({ copy, onAction }: Props) {
  const { theme: t } = useTheme()
  const frame = {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: radius.xl,
    borderCurve: 'continuous' as const,
    padding: spacing.xl,
    gap: spacing.md,
  }

  if (!copy) {
    return (
      <View style={frame} accessible accessibilityLabel="Loading your next step" aria-busy>
        <Skeleton width="70%" height={26} />
        <Skeleton height={16} />
        <Skeleton width={160} height={48} radius={radius.lg} />
      </View>
    )
  }

  return (
    <View style={frame} testID="practice-next-step">
      <View style={{ gap: spacing.xs }}>
        <Text accessibilityRole="header" style={textStyle('headline', t.textPrimary)} maxFontSizeMultiplier={1.6}>
          {copy.title}
        </Text>
        <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.8}>{copy.body}</Text>
      </View>
      <Button label={copy.actionLabel} size="lg" onPress={() => onAction(copy.href)} />
    </View>
  )
}
