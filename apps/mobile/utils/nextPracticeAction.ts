/**
 * Practice tab, direction C ("One Next Step"): pick the single practice action
 * the student should take now. Pure — the screen gathers the inputs.
 *
 * Priority: finish an unfinished mock → clear due flashcards (spaced review
 * decays fastest) → drill the weakest topic → take the focus exam's mock →
 * the diagnostic, for a student with no history yet.
 */

export interface NextPracticeInput {
  /** A saved, unfinished blueprint mock run (from examRuns). */
  resume: { slug: string; title: string; answered: number; total: number } | null
  dueCount: number
  /** The weakest practised topic in the focus exam's scope, if any. */
  weakTopic: { id: string; name: string } | null
  /** The mock for the student's first focus exam, if one is published. */
  focusMock: { slug: string; title: string; items: number; minutes: number } | null
}

export type NextPractice =
  | { kind: 'resume'; slug: string; title: string; answered: number; total: number }
  | { kind: 'due'; count: number }
  | { kind: 'topic'; topicId: string; topicName: string }
  | { kind: 'mock'; slug: string; title: string; items: number; minutes: number }
  | { kind: 'diagnostic' }

export function pickNextPractice(input: NextPracticeInput): NextPractice {
  const { resume, dueCount, weakTopic, focusMock } = input
  if (resume && resume.total > 0) return { kind: 'resume', ...resume }
  if (dueCount > 0) return { kind: 'due', count: dueCount }
  if (weakTopic) return { kind: 'topic', topicId: weakTopic.id, topicName: weakTopic.name }
  if (focusMock) return { kind: 'mock', ...focusMock }
  return { kind: 'diagnostic' }
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
  }
}
