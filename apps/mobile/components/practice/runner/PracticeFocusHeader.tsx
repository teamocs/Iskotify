import { RunnerTopBar } from './RunnerTopBar'

interface Props {
  title: string
  position: number
  total: number
  answered: number
  onLeave: () => void
  /** Spoken name of the leave control. */
  leaveLabel?: string
  /** Report (flag) the current question. */
  onFlag?: () => void
  flagged?: boolean
}

/**
 * ExamFocusHeader's untimed twin, for the flashcard quiz: the same glass top
 * bar without a timer, so every runner reads as one frame.
 */
export function PracticeFocusHeader({ title, position, total, answered, onLeave, leaveLabel = 'Leave', onFlag, flagged }: Props) {
  return (
    <RunnerTopBar
      title={title}
      position={position}
      total={total}
      answered={answered}
      onLeave={onLeave}
      leaveLabel={leaveLabel}
      onFlag={onFlag}
      flagged={flagged}
    />
  )
}
