// Pure pace line for Today's exam countdown tiles. No React, no DB.
//
// "Pace" is how many days the student practised in the last 7, against a
// weekly target that rises as the exam gets closer (the same pacing bands the
// study plan sizes itself by). The copy is calm by design (brandbook §5–6):
// "On pace" or "N sessions to catch up", never "behind" and never a warning
// colour. With no practice history at all there is nothing to measure, so no
// line is shown (the next step already says where to start).

import { pacingBand, type PacingBand } from './studyPlan'

/** Practice days a week each pacing band asks for. */
export const WEEKLY_SESSIONS: Record<PacingBand, number> = { light: 3, moderate: 4, heavy: 5 }

export type ExamPace = { kind: 'on_pace' } | { kind: 'catch_up'; sessions: number }

/**
 * @param daysLeft  whole days to the exam (null: no date, paces light)
 * @param practiceDayIndices  local day indices with any practice
 * @param todayIndex  today's local day index
 */
export function examPace(daysLeft: number | null, practiceDayIndices: readonly number[], todayIndex: number): ExamPace | null {
  if (practiceDayIndices.length === 0) return null
  const target = WEEKLY_SESSIONS[pacingBand(daysLeft)]
  const recent = new Set(practiceDayIndices.filter(d => d > todayIndex - 7 && d <= todayIndex)).size
  const gap = target - recent
  return gap <= 0 ? { kind: 'on_pace' } : { kind: 'catch_up', sessions: gap }
}

export function examPaceLabel(pace: ExamPace): string {
  if (pace.kind === 'on_pace') return 'On pace'
  return `${pace.sessions} session${pace.sessions === 1 ? '' : 's'} to catch up`
}
