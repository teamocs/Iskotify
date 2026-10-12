import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, iosTextStyle } from '../../theme/tokens'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import type { NextPracticeCopy } from '../../utils/nextPracticeAction'

interface Props {
  /** Null while the inputs load. */
  copy: NextPracticeCopy | null
  onAction: (href: string) => void
  /**
   * The maroon fill. False when the tab's mock hero already holds the one
   * primary action: the step's button is then tinted.
   */
  primary?: boolean
}

/**
 * Direction C's "one next step". iOS redesign P4: the full mock hero is the
 * tab's one primary action, so this button is tinted whenever the hero shows
 * and maroon only when there is no hero.
 * The heading IS the action ("Review 7 due cards"), a single line says why,
 * and one button does it. No eyebrow, no stats: the lists below carry those.
 */
export function NextStepCard({ copy, onAction, primary = true }: Props) {
  const { theme: t } = useTheme()
  const frame = {
    backgroundColor: t.surface,
    borderRadius: radius.card,
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
        <Text accessibilityRole="header" style={iosTextStyle('title3', t.textPrimary)} maxFontSizeMultiplier={1.6}>
          {copy.title}
        </Text>
        <Text style={iosTextStyle('body', t.textSecondary)} maxFontSizeMultiplier={1.8}>{copy.body}</Text>
      </View>
      <Button label={copy.actionLabel} size="lg" variant={primary ? 'primary' : 'tinted'} onPress={() => onAction(copy.href)} />
    </View>
  )
}
