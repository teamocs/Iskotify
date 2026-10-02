/**
 * Practice tab, direction C ("One Next Step"): pick the single practice action
 * the student should take now. Pure — the screen gathers the inputs.
 *
 * Priority: finish an unfinished mock → clear due flashcards (spaced review
 * decays fastest) → drill the weakest topic (a flashcard topic, else a UPCAT
 * subtest, so a student who only takes UPCAT drills/mocks still gets one) →
 * take the focus exam's mock → the diagnostic, for a student who has not taken
 * it yet → otherwise a short drill (never the diagnostic again).
 *
 * The UPCAT steps (weak subtest, UPCAT diagnostic, UPCAT drill) apply only
 * when UPCAT is the practice focus exam or nothing is in focus
 * (utils/practiceQuickStart.practiceFocusExam). For any other exam: its own
 * diagnostic when it has a runnable blueprint and it was not taken yet, else
 * its practice chooser (or its page, when nothing can be practised yet).
 */

import { WEAK_THRESHOLD } from './weakness'
import { isSchoolFocusSlug, focusContentSlug } from './focusSlug'
import { UPCAT_SLUG } from './practiceQuickStart'

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
  /** The focus exam's diagnostic is already recorded (services/practiceSignals.hasTakenDiagnostic for that exam). */
  hasTakenDiagnostic?: boolean
  /**
   * The practice focus exam (practiceQuickStart.practiceFocusExam). Absent,
   * null or UPCAT: the UPCAT steps apply. `runnable` = it has a runnable
   * blueprint; `hasReview` = it has topic review content (both for its
   * content slug: a school focus studies 'general-cet').
   */
  focusExam?: { slug: string; label: string; runnable: boolean; hasReview: boolean } | null
}

export type NextPractice =
  | { kind: 'resume'; slug: string; title: string; answered: number; total: number }
  | { kind: 'due'; count: number }
  | { kind: 'topic'; topicId: string; topicName: string }
  | { kind: 'subtest'; subtest: string }
  | { kind: 'mock'; slug: string; title: string; items: number; minutes: number }
  /** `exam` = a non-UPCAT exam's own diagnostic; absent = the UPCAT diagnostic. */
  | { kind: 'diagnostic'; exam?: string }
  /** A non-UPCAT focus exam's practice: its chooser when something is ready, else its page. */
  | { kind: 'practise'; slug: string; label: string; ready: boolean }
  /** Keep-sharp drill after the diagnostic: the lowest subtest, or all four mixed (null). */
  | { kind: 'drill'; subtest: string | null }

export function pickNextPractice(input: NextPracticeInput): NextPractice {
  const { resume, dueCount, weakTopic, focusMock, subtestAccuracy = [], hasTakenDiagnostic = false, focusExam } = input
  const otherExam = focusExam && focusExam.slug !== UPCAT_SLUG ? focusExam : null
  const lowest = subtestAccuracy.reduce<{ subtest: string; pct: number } | null>(
    (worst, s) => (!worst || s.pct < worst.pct ? s : worst), null,
  )
  if (resume && resume.total > 0) return { kind: 'resume', ...resume }
  if (dueCount > 0) return { kind: 'due', count: dueCount }
  if (weakTopic) return { kind: 'topic', topicId: weakTopic.id, topicName: weakTopic.name }
  if (otherExam) {
    if (focusMock) return { kind: 'mock', ...focusMock }
    // A school focus's diagnostic is its content exam's (general-cet): there is no school:<id> diagnostic.
    if (otherExam.runnable && !hasTakenDiagnostic) return { kind: 'diagnostic', exam: focusContentSlug(otherExam.slug) }
    return { kind: 'practise', slug: otherExam.slug, label: otherExam.label, ready: otherExam.runnable || otherExam.hasReview }
  }
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
        href: next.exam ? `/practice/diagnostic?exam=${encodeURIComponent(next.exam)}` : '/practice/diagnostic',
      }
    case 'practise':
      // A school-level focus has no page of its own here: its chooser always has general practice.
      return next.ready || isSchoolFocusSlug(next.slug)
        ? {
            title: `Keep your ${next.label} practice going`,
            body: 'Nothing is due and nothing is weak. A short review keeps your skills moving.',
            actionLabel: 'Choose practice',
            href: `/practice/start/${encodeURIComponent(next.slug)}`,
          }
        : {
            title: `${next.label} practice is coming soon`,
            body: 'There are no questions for this exam yet. Its dates and requirements are ready now.',
            actionLabel: 'Open exam page',
            href: `/listings/${encodeURIComponent(next.slug)}`,
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
