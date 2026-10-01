/**
 * Practice tab, direction C ("One Next Step"): pick the single practice action
 * the student should take now. Pure — the screen gathers the inputs.
 *
 * Priority: finish an unfinished mock → clear due flashcards (spaced review
 * decays fastest) → drill the weakest topic (a flashcard topic, else a UPCAT
 * subtest, so a student who only takes UPCAT drills/mocks still gets one) →
 * take the focus exam's mock → the diagnostic, for a student who has not taken
 * it yet → otherwise a short drill (never the diagnostic again).
 */

import { WEAK_THRESHOLD } from './weakness'

export interface NextPracticeInput {
  /** A saved, unfinished blueprint mock run (from examRuns). */
  resume: { slug: string; title: string; answered: number; total: number } | null
  dueCount: number
  /** The weakest practised topic in the focus exam's scope, if any. */
  weakTopic: { id: string; name: string } | null
  /** The mock for the student's first focus exam, if one is published. */
  focusMock: { slug: string; title: string; items: number; minutes: number } | null
  /** Recent UPCAT question accuracy per subtest (services/practiceSignals.getUpcatSubtestAccuracy). */
  subtestAccuracy?: { subtest: string; pct: number }[]
  /** A diagnostic sitting is already recorded (practice_sessions kind 'diagnostic'). */
  hasTakenDiagnostic?: boolean
}

export type NextPractice =
  | { kind: 'resume'; slug: string; title: string; answered: number; total: number }
  | { kind: 'due'; count: number }
  | { kind: 'topic'; topicId: string; topicName: string }
  | { kind: 'subtest'; subtest: string }
  | { kind: 'mock'; slug: string; title: string; items: number; minutes: number }
  | { kind: 'diagnostic' }
  /** Keep-sharp drill after the diagnostic: the lowest subtest, or all four mixed (null). */
  | { kind: 'drill'; subtest: string | null }

export function pickNextPractice(input: NextPracticeInput): NextPractice {
  const { resume, dueCount, weakTopic, focusMock, subtestAccuracy = [], hasTakenDiagnostic = false } = input
  const lowest = subtestAccuracy.reduce<{ subtest: string; pct: number } | null>(
    (worst, s) => (!worst || s.pct < worst.pct ? s : worst), null,
  )
  if (resume && resume.total > 0) return { kind: 'resume', ...resume }
  if (dueCount > 0) return { kind: 'due', count: dueCount }
  if (weakTopic) return { kind: 'topic', topicId: weakTopic.id, topicName: weakTopic.name }
  if (lowest && lowest.pct < WEAK_THRESHOLD * 100) return { kind: 'subtest', subtest: lowest.subtest }
  if (focusMock) return { kind: 'mock', ...focusMock }
  if (!hasTakenDiagnostic) return { kind: 'diagnostic' }
  return { kind: 'drill', subtest: lowest?.subtest ?? null }
}

/** The UPCAT quick drill for one subtest, or all four ('all'). */
function upcatDrillHref(subtest: string | null): string {
  return `/practice/upcat/${subtest ? encodeURIComponent(subtest) : 'all'}?mode=quick`
}

export interface NextPracticeCopy {
  title: string
  body: string
  actionLabel: string
  href: string
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  return `${Math.round((minutes / 60) * 10) / 10} h`
}

/** Encouraging-but-exact copy for the next-step card (brand voice: calm on practice). */
export function nextPracticeCopy(next: NextPractice): NextPracticeCopy {
  switch (next.kind) {
    case 'resume':
      return {
        title: `Finish your ${next.title} mock`,
        body: `${next.answered} of ${next.total} answered. Your answers and timer were saved.`,
        actionLabel: 'Resume mock',
        href: `/practice/exam/${next.slug}`,
      }
    case 'due':
      return {
        title: `Review ${next.count} due card${next.count === 1 ? '' : 's'}`,
        body: 'A quick spaced review keeps what you already learned from fading.',
        actionLabel: 'Start review',
        href: '/practice/due',
      }
    case 'topic':
      return {
        title: `Drill ${next.topicName}`,
        body: 'Your weakest topic right now. A short set here moves your readiness the most.',
        actionLabel: 'Start drill',
        href: `/practice/${next.topicId}`,
      }
    case 'subtest':
      return {
        title: `Drill ${next.subtest}`,
        body: 'Your weakest subject right now. A short set here moves your readiness the most.',
        actionLabel: 'Start drill',
        href: upcatDrillHref(next.subtest),
      }
    case 'mock':
      return {
        title: `Take a ${next.title} mock`,
        body: `${next.items} items · ${duration(next.minutes)}. Or try a 30-minute Study Sprint from the same screen.`,
        actionLabel: 'Open mock exam',
        href: `/practice/exam/${next.slug}`,
      }
    case 'diagnostic':
      return {
        title: 'Find your starting point',
        body: 'A short diagnostic shows which subjects to practise first. No timer pressure.',
        actionLabel: 'Take the diagnostic',
        href: '/practice/diagnostic',
      }
    case 'drill':
      return {
        title: next.subtest ? `Keep ${next.subtest} sharp` : 'Keep your skills sharp',
        body: next.subtest
          ? 'Nothing is due and nothing is weak. A short drill in your lowest subject keeps it moving.'
          : 'Nothing is due and nothing is weak. A short mixed drill keeps all four subjects fresh.',
        actionLabel: 'Start drill',
        href: upcatDrillHref(next.subtest),
      }
  }
}
