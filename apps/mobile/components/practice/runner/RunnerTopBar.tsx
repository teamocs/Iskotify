import { View } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined, StopwatchOutlined, Flag1Outlined, Flag2Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../../theme/ThemeContext'
import { layout, radius, spacing } from '../../../theme/tokens'
import { decorative } from '../../ui/a11y'
import { Glass } from '../../ui/Glass'
import { Text } from '../../ui/Text'
import { ProgressBar } from '../../ui/ProgressBar'
import { GlassIconButton } from '../../navigation/GlassIconButton'

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

export interface RunnerTimer {
  /** Spoken name ("Time left", "Section time left"). */
  label: string
  secs: number
  /** The clock that matters most right now (the section clock when there is one). */
  emphasis: boolean
}

/**
 * A timer capsule: `role="timer"`, tabular numerals, and a spoken
 * "Time left: 04:59". Low time adds a warning tint AND an outline, so the
 * change is never hue-only.
 */
export function TimerCapsule({ label, secs, emphasis }: RunnerTimer) {
  const { theme: t } = useTheme()
  const low = secs <= LOW_TIME_SECS
  const fg = low ? t.warningStrong : emphasis ? t.textPrimary : t.textSecondary
  return (
    <View
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${label}: ${fmtClock(secs)}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
        minHeight: 30, paddingHorizontal: spacing.md, borderRadius: radius.capsule,
        backgroundColor: low ? t.warningSurface : t.surface,
        borderWidth: 1, borderColor: low ? t.warningBorder : t.border,
      }}
    >
      <View {...decorative}>
        <Lineicons icon={StopwatchOutlined} size={14} color={fg} />
      </View>
      <Text
        role={emphasis ? 'headline' : 'subheadline'}
        color={fg}
        chrome
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {fmtClock(secs)}
      </Text>
    </View>
  )
}

export interface RunnerTopBarProps {
  /** The subtest / section / set name, centred. */
  title: string
  position: number
  total: number
  answered: number
  onLeave: () => void
  /** Spoken name of the close control. */
  leaveLabel?: string
  /** Report (flag) the current question. Omit where a runner has no reporting. */
  onFlag?: () => void
  /** The current question was already reported. */
  flagged?: boolean
  /** Countdown capsules, most important first. */
  timers?: RunnerTimer[]
}

/**
 * The runner's translucent glass top bar (iOS redesign P4): a close glass
 * circle, the centred name over "Question N of M" (tabular figures), a flag
 * button, then the timer capsule(s) and a thin 4pt answered-progress bar.
 * Text sits on glass in textPrimary/textSecondary (never accentText).
 */
export function RunnerTopBar({
  title, position, total, answered, onLeave, leaveLabel = 'Leave', onFlag, flagged = false, timers = [],
}: RunnerTopBarProps) {
  const { theme: t } = useTheme()
  const spacer = <View style={{ width: layout.headerButton.hit }} />

  return (
    <Glass variant="header" testID="runner-top-bar" style={{ borderBottomWidth: 1, borderBottomColor: t.divider }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, paddingTop: spacing.xs }}>
        <GlassIconButton icon={XmarkOutlined} accessibilityLabel={leaveLabel} onPress={onLeave} />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <Text role="headline" chrome numberOfLines={1} style={{ textAlign: 'center' }}>{title}</Text>
          <Text role="footnote" color={t.textSecondary} chrome style={{ fontVariant: ['tabular-nums'], textAlign: 'center' }}>
            Question {position} of {total}
          </Text>
        </View>
        {onFlag ? (
          <GlassIconButton
            icon={flagged ? Flag2Outlined : Flag1Outlined}
            accessibilityLabel={flagged ? 'Reported' : 'Report this question'}
            accessibilityHint={flagged ? undefined : 'Tell us what is wrong with it'}
            onPress={onFlag}
            disabled={flagged}
          />
        ) : spacer}
      </View>
      <View style={{ gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.sm }}>
        {timers.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
            {timers.map(tm => <TimerCapsule key={tm.label} {...tm} />)}
          </View>
        ) : null}
        <ProgressBar value={total ? answered / total : 0} label={`Answered ${answered} of ${total}`} height={4} />
      </View>
    </Glass>
  )
}
