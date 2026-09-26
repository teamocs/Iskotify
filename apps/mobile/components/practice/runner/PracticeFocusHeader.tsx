import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined, DashboardSquare1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../../theme/tokens'
import { focusRing, type WebPressableState } from '../../ui/a11y'
import { ProgressBar } from '../../ui/ProgressBar'

interface Props {
  title: string
  position: number
  total: number
  answered: number
  onLeave: () => void
  /** Spoken name of the leave control. */
  leaveLabel?: string
  /** Opens the question overview. Omit when the side panel is already on screen. */
  onOpenOverview?: () => void
}

/**
 * ExamFocusHeader's untimed twin, for the flashcard quiz: leave · where am I ·
 * overview, with answered progress underneath. Same metrics, so every runner
 * reads as one frame.
 */
export function PracticeFocusHeader({
  title, position, total, answered, onLeave, leaveLabel = 'Leave', onOpenOverview,
}: Props) {
  const { theme: t } = useTheme()
  const iconBtn = (s: unknown) => {
    const { pressed, focused } = s as WebPressableState
    return [
      {
        width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: radius.pill,
        alignItems: 'center' as const, justifyContent: 'center' as const,
        backgroundColor: pressed ? t.surface2 : 'transparent',
      },
      focusRing(t.focusRing, focused),
    ]
  }

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: t.divider, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
        <Pressable onPress={onLeave} accessibilityRole="button" accessibilityLabel={leaveLabel} style={iconBtn}>
          <Lineicons icon={XmarkOutlined} size={22} color={t.textSecondary} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={1} maxFontSizeMultiplier={1.4}>{title}</Text>
          <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>
            Question {position} of {total}
          </Text>
        </View>
        {onOpenOverview ? (
          <Pressable onPress={onOpenOverview} accessibilityRole="button" accessibilityLabel="All questions" style={iconBtn}>
            <Lineicons icon={DashboardSquare1Outlined} size={22} color={t.textSecondary} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <ProgressBar value={total ? answered / total : 0} label={`Answered ${answered} of ${total}`} height={4} />
      </View>
    </View>
  )
}
