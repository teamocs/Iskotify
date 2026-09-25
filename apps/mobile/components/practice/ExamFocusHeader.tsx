import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined, StopwatchOutlined, DashboardSquare1Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle, fonts } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { ProgressBar } from '../ui/ProgressBar'

export function fmtClock(totalSecs: number): string {
  const s = Math.max(0, Math.floor(totalSecs))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Seconds at or under which a timer switches to its "almost out" state. */
export const LOW_TIME_SECS = 60

function TimerChip({ label, secs, emphasis }: { label: string; secs: number; emphasis: boolean }) {
  const { theme: t } = useTheme()
  const low = secs <= LOW_TIME_SECS
  const fg = low ? t.warningStrong : emphasis ? t.textPrimary : t.textSecondary
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${fmtClock(secs)}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
        minHeight: 32, paddingHorizontal: spacing.sm, borderRadius: radius.pill,
        // Low time adds a tinted chip AND an outline, so the change is not hue-only.
        backgroundColor: low ? t.warningSurface : 'transparent',
        borderWidth: 1, borderColor: low ? t.warningBorder : 'transparent',
      }}
    >
      <View {...decorative}>
        <Lineicons icon={StopwatchOutlined} size={16} color={fg} />
      </View>
      <Text
        style={[textStyle(emphasis ? 'titleSm' : 'label', fg), { fontFamily: fonts.heading, fontVariant: ['tabular-nums'] }]}
        maxFontSizeMultiplier={1.3}
      >
        {fmtClock(secs)}
      </Text>
    </View>
  )
}

interface Props {
  title: string
  position: number
  total: number
  answered: number
  /** Total time left (seconds). */
  remaining: number
  /** Section time left when the exam is section-timed; the total becomes secondary. */
  sectionRemaining?: number | null
  onLeave: () => void
  /** Opens the question overview. Omit when the overview is already on screen (side panel). */
  onOpenOverview?: () => void
}

/**
 * The runner's one slim header (direction C focus mode): leave · where am I ·
 * time left · overview. Answered progress runs underneath as a thin bar.
 */
export function ExamFocusHeader({
  title, position, total, answered, remaining, sectionRemaining, onLeave, onOpenOverview,
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
  const sectionTimed = sectionRemaining != null

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: t.divider, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}>
        <Pressable onPress={onLeave} accessibilityRole="button" accessibilityLabel="Leave exam" style={iconBtn}>
          <Lineicons icon={XmarkOutlined} size={22} color={t.textSecondary} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={textStyle('titleSm', t.textPrimary)} numberOfLines={1} maxFontSizeMultiplier={1.4}>{title}</Text>
          <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={1.4}>
            Question {position} of {total}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          {sectionRemaining != null ? <TimerChip label="Section time left" secs={sectionRemaining} emphasis /> : null}
          <TimerChip label={sectionTimed ? 'Total time left' : 'Time left'} secs={remaining} emphasis={!sectionTimed} />
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
