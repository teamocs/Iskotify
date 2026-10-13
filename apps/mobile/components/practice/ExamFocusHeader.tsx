import { RunnerTopBar, type RunnerTimer } from './runner/RunnerTopBar'

export { fmtClock, LOW_TIME_SECS } from './runner/RunnerTopBar'

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
  /** Report (flag) the current question. */
  onFlag?: () => void
  flagged?: boolean
}

/**
 * The timed runners' glass top bar (mock exam, UPCAT subtest, diagnostic):
 * leave · subtest and "Question N of M" · flag, then the timer capsule(s).
 * A section-timed exam leads with the section clock; the total follows.
 */
export function ExamFocusHeader({
  title, position, total, answered, remaining, sectionRemaining, onLeave, onFlag, flagged,
}: Props) {
  const sectionTimed = sectionRemaining != null
  const timers: RunnerTimer[] = sectionTimed
    ? [
        { label: 'Section time left', secs: sectionRemaining, emphasis: true },
        { label: 'Total time left', secs: remaining, emphasis: false },
      ]
    : [{ label: 'Time left', secs: remaining, emphasis: true }]
  return (
    <RunnerTopBar
      title={title}
      position={position}
      total={total}
      answered={answered}
      onLeave={onLeave}
      leaveLabel="Leave exam"
      onFlag={onFlag}
      flagged={flagged}
      timers={timers}
    />
  )
}
