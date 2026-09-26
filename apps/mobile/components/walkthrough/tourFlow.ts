/**
 * The guided tour's content and navigation rules (pure, unit-tested).
 * Screen: app/tour.tsx. Card visuals: components/walkthrough/TourVisuals.tsx.
 */
export type TourCardId = 'welcome' | 'today' | 'practice' | 'explore' | 'progress' | 'ready'

export interface TourCard {
  id: TourCardId
  /** One line. */
  title: string
  /** Exactly two short lines. */
  body: [string, string]
  /** Tab cards: where "Take me there" goes. */
  href?: string
  /** Tab name for the "Take me to …" accessible name. */
  tabLabel?: string
}

export const TOUR_CARDS: readonly TourCard[] = [
  {
    id: 'welcome',
    title: 'One next step, every day',
    body: [
      'Iskotify always shows you the one thing to do now.',
      'Small steps, done daily, add up by exam day.',
    ],
  },
  {
    id: 'today',
    title: 'Today tells you what to do next',
    body: [
      'Your exam countdown and your plan for the day.',
      'Tap the next step and you are already studying.',
    ],
    href: '/(tabs)',
    tabLabel: 'Today',
  },
  {
    id: 'practice',
    title: "Practice like it's exam day",
    body: [
      'Timed mock exams, subject drills and flashcards due today.',
      'Mocks save as you go. Stop anytime, pick up later.',
    ],
    href: '/practice',
    tabLabel: 'Practice',
  },
  {
    id: 'explore',
    title: 'Find your schools and scholarships',
    body: [
      'Entrance exams, scholarships and courses in one place.',
      'Add one to your focus and its deadlines follow you.',
    ],
    href: '/explore',
    tabLabel: 'Explore',
  },
  {
    id: 'progress',
    title: "See what's getting better",
    body: [
      'How ready you are per subject, from your real answers.',
      'Scores are a starting point, not a verdict.',
    ],
    href: '/progress',
    tabLabel: 'Progress',
  },
  {
    id: 'ready',
    title: 'Tara, simulan na natin!',
    body: [
      "Start with today's next step. Kaya mo 'to.",
      'Replay this tour anytime from Help and support.',
    ],
  },
]

export const TOUR_LENGTH = TOUR_CARDS.length

/** "n of N": the visible and announced position. */
export function tourPositionLabel(index: number): string {
  return `${index + 1} of ${TOUR_LENGTH}`
}

export type TourSource = 'onboarding' | 'help' | 'settings' | 'replay'

export function parseTourSource(v: unknown): TourSource {
  const s = Array.isArray(v) ? v[0] : v
  return s === 'onboarding' || s === 'help' || s === 'settings' ? s : 'replay'
}

/**
 * Where finishing onboarding goes. The tour opens automatically only the
 * first time (tour_seen_at = 0); returning students are never routed here by
 * the launch gates, which only look at the profile and focus.
 */
export function afterOnboardingHref(tourSeenAt: number | null | undefined): string {
  return tourSeenAt && tourSeenAt > 0 ? '/(tabs)' : '/tour?from=onboarding'
}

export type TourExit =
  | { method: 'replace'; href: string }
  | { method: 'dismissTo'; href: string }
  | { method: 'back'; href: string }

const TODAY = '/(tabs)'

/**
 * How to leave the tour. After onboarding nothing useful sits behind it, so
 * the tour is replaced. A replay (Help, Settings, a link) goes back on Skip and
 * dismisses to the tab otherwise, so screens don't pile up on the stack.
 * `back` carries a fallback href for when there is no history (web refresh).
 */
export function tourExit(source: TourSource, action: 'skip' | 'finish' | string): TourExit {
  const href = action === 'skip' || action === 'finish' ? TODAY : action
  if (source === 'onboarding') return { method: 'replace', href }
  if (action === 'skip') return { method: 'back', href: TODAY }
  return { method: 'dismissTo', href }
}

/** Web arrow keys. */
export function keyAction(key: string): 'next' | 'back' | null {
  if (key === 'ArrowRight') return 'next'
  if (key === 'ArrowLeft') return 'back'
  return null
}

const SWIPE_DISTANCE = 50
const FLICK_VELOCITY = 0.5

/** Native swipe: a clear horizontal drag, or a fast flick. */
export function swipeAction(dx: number, dy: number, vx = 0): 'next' | 'back' | null {
  if (Math.abs(dy) > Math.abs(dx)) return null
  const far = Math.abs(dx) >= SWIPE_DISTANCE
  const fast = Math.abs(vx) >= FLICK_VELOCITY && Math.abs(dx) >= 20
  if (!far && !fast) return null
  return dx < 0 ? 'next' : 'back'
}
