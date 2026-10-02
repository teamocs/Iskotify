// Pure helpers for the Today screen's "one next step" (redesign M2, direction C).
// No React, no DB — fully unit-testable.

import type { StudyPlanItemKind } from './studyPlan'
import { daysUntilDate, localDayOffsetMs } from './localDay'

export interface PlanItemLike {
  id: number
  kind: StudyPlanItemKind
  refId: string
  targetCount: number
  completedAt: number | null
}

export interface PlanItemCopy {
  title: string
  detail: string
  route: string
  /** Verb for the one primary button ("Start practice"). */
  actionLabel: string
}

/** Title, supporting line, destination and button verb for one plan item. */
export function planItemCopy(item: PlanItemLike, topicNameById: Map<string, string>): PlanItemCopy {
  switch (item.kind) {
    case 'srs_review':
      return {
        title: `Review ${item.targetCount} due flashcard${item.targetCount === 1 ? '' : 's'}`,
        detail: 'Keeps your spaced-repetition schedule on track',
        route: '/practice/due',
        actionLabel: 'Review cards',
      }
    case 'topic_practice':
      return {
        title: `Practice ${topicNameById.get(item.refId) ?? 'this topic'}`,
        detail: `${item.targetCount} questions · your weakest area`,
        route: `/practice/${item.refId}`,
        actionLabel: 'Start practice',
      }
    case 'mock_section':
      return {
        // Opens the exam's full prestart, so it is a whole mock, not a section.
        title: 'Timed mock',
        detail: 'A full, timed dress rehearsal for the real exam',
        route: `/practice/exam/${item.refId}`,
        actionLabel: 'Start mock',
      }
    case 'diagnostic':
      return {
        title: 'Quick diagnostic',
        detail: 'Find your starting point in a few minutes',
        route: '/practice/diagnostic',
        actionLabel: 'Start diagnostic',
      }
  }
}

export type NextStep =
  | { kind: 'loading' }
  | { kind: 'error' }
  | ({ kind: 'task'; itemId: number; done: number; total: number } & PlanItemCopy)
  | { kind: 'done'; reason: 'complete' | 'empty'; tomorrowCount: number }

export interface PickNextStepInput {
  items: PlanItemLike[]
  loading: boolean
  error: boolean
  tomorrowItemCount: number
  topicNameById: Map<string, string>
}

/**
 * The single thing Today asks the student to do: the first plan item not yet
 * done. Stale items beat an error (the student can still act on them).
 */
export function pickNextStep({ items, loading, error, tomorrowItemCount, topicNameById }: PickNextStepInput): NextStep {
  if (loading) return { kind: 'loading' }
  if (items.length === 0) {
    if (error) return { kind: 'error' }
    return { kind: 'done', reason: 'empty', tomorrowCount: tomorrowItemCount }
  }
  const next = items.find(i => i.completedAt == null)
  if (!next) return { kind: 'done', reason: 'complete', tomorrowCount: tomorrowItemCount }
  const done = items.filter(i => i.completedAt != null).length
  return { kind: 'task', itemId: next.id, done, total: items.length, ...planItemCopy(next, topicNameById) }
}

export interface CountdownListingLike {
  slug: string
  title: string
  type: string
  examDate: number | null
}

export interface Countdown {
  slug: string
  title: string
  /** Whole local calendar days until the exam date; 0 all through exam day. */
  days: number
  dateMs: number
}

/**
 * The one focused-exam countdown: the soonest upcoming exam in Focus.
 * Exam dates are date-only values (stored at UTC midnight of the calendar
 * date), so they are compared against the LOCAL calendar day — an exam is 0
 * days away all through its own day and gone the next. `offsetMs` pins the
 * zone for tests (default: the device's).
 */
export function pickCountdown(
  listings: CountdownListingLike[],
  now: number,
  offsetMs: number = localDayOffsetMs(),
): Countdown | null {
  let best: Countdown | null = null
  for (const l of listings) {
    if (l.type !== 'exam' || l.examDate == null) continue
    const days = daysUntilDate(l.examDate, now, offsetMs)
    if (days < 0) continue
    if (best && l.examDate >= best.dateMs) continue
    best = { slug: l.slug, title: l.title, days, dateMs: l.examDate }
  }
  return best
}
