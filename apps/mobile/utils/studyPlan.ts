// Pure "Today's Plan" generator (Task I). No React/DB — hooks/useStudyPlan.ts
// gathers the inputs (due SRS count, weak topics, focused exam dates, whether
// the user has ANY practice history) and calls generateStudyPlan() with
// `today` passed in explicitly, so this file stays fully deterministic and
// unit-testable (never reads Date.now()/new Date() itself).
//
// ── Ordering + sizing rules ──────────────────────────────────────────────────
// 1. Due SRS reviews always come first (they're time-sensitive — the review
//    schedule assumes "today").
// 2. Then topic practice on the user's weakest subject(s) (utils/srs.ts-style
//    input already sorted weakest-first, mirrors hooks/useHomeStats.ts's
//    computeWeakTopics), sized by how close the nearest focused exam is:
//      > 60 days out (or no exam focused at all) → 'light'  pacing
//      21–60 days out                            → 'moderate' pacing
//      < 21 days out                              → 'heavy'  pacing (adds a
//        once-a-week timed mock section, generated only on Sundays — the
//        same weekly cadence as services/notifications.ts's weak-areas nudge)
// 3. A brand-new user with no due reviews, no weak topics, AND no practice
//    history at all gets a single 'diagnostic' item instead — there's nothing
//    to size a plan from yet.
// 4. A user with no due reviews and no weak topics but SOME practice history
//    is "all caught up" — the generator returns an empty plan rather than
//    inventing busywork; hooks/useStudyPlan.ts renders the all-done state.

export type StudyPlanItemKind = 'srs_review' | 'topic_practice' | 'mock_section' | 'diagnostic'

export interface StudyPlanItemDraft {
  kind: StudyPlanItemKind
  /** topicId for topic_practice, listingSlug for mock_section, '' otherwise. */
  refId: string
  targetCount: number
}

export interface WeakTopicInput {
  topicId: string
  topicName: string
  accuracy: number
}

export interface GenerateStudyPlanInput {
  /** "Now", passed in explicitly so the generator never reads the clock itself. */
  today: Date
  /** Epoch ms of the nearest focused exam with a date, or null if none. */
  earliestExamDate: number | null
  /** Total flashcards currently due (services/srsAggregates.ts's getDueCounts().total). */
  dueSrsCount: number
  /** Weakest-first, already filtered to <60% accuracy (useHomeStats.computeWeakTopics shape). */
  weakTopics: WeakTopicInput[]
  /** True once the user has completed ANY practice activity, ever (not just today). */
  hasAnyReadinessData: boolean
  /** listingSlug of the nearest focused exam — used as the mock_section item's refId. */
  mockSectionRefId: string | null
}

export type PacingBand = 'light' | 'moderate' | 'heavy'

interface BandConfig {
  srsCap: number
  topicItems: number
  topicTarget: number
}

// Exported so tests (and any future tuning) can see the exact caps without
// re-deriving them from the generator's behavior.
export const PACING_BAND_CONFIG: Record<PacingBand, BandConfig> = {
  light:    { srsCap: 15, topicItems: 1, topicTarget: 8 },
  moderate: { srsCap: 20, topicItems: 1, topicTarget: 12 },
  heavy:    { srsCap: 25, topicItems: 2, topicTarget: 10 },
}

const DAY_MS = 86_400_000

/** Whole days from `today` to `examMs` (ceil — "3.2 days left" reads as 4). */
export function daysUntil(today: Date, examMs: number): number {
  return Math.ceil((examMs - today.getTime()) / DAY_MS)
}

/**
 * pacingBand — how urgent the nearest focused exam is. No focused exam (or
 * one without a date) paces the same as "far away": there's nothing to rush.
 */
export function pacingBand(daysRemaining: number | null): PacingBand {
  if (daysRemaining == null) return 'light'
  if (daysRemaining > 60) return 'light'
  if (daysRemaining >= 21) return 'moderate'
  return 'heavy'
}

/** Sunday, matching services/notifications.ts's WEEKLY weak-areas nudge cadence. */
export function isWeeklyMockDay(today: Date): boolean {
  return today.getDay() === 0
}

/**
 * generateStudyPlan — today's ordered plan (see file header for the rules).
 * Pure and deterministic: same input always produces the same output.
 */
export function generateStudyPlan(input: GenerateStudyPlanInput): StudyPlanItemDraft[] {
  const { today, earliestExamDate, dueSrsCount, weakTopics, hasAnyReadinessData, mockSectionRefId } = input

  const noSignal = dueSrsCount === 0 && weakTopics.length === 0
  if (noSignal) {
    if (!hasAnyReadinessData) {
      return [{ kind: 'diagnostic', refId: '', targetCount: 1 }]
    }
    return [] // all caught up — nothing due, no weak spots
  }

  const daysRemaining = earliestExamDate != null ? daysUntil(today, earliestExamDate) : null
  const band = pacingBand(daysRemaining)
  const caps = PACING_BAND_CONFIG[band]

  const items: StudyPlanItemDraft[] = []

  if (dueSrsCount > 0) {
    items.push({ kind: 'srs_review', refId: '', targetCount: Math.min(dueSrsCount, caps.srsCap) })
  }

  for (const topic of weakTopics.slice(0, caps.topicItems)) {
    items.push({ kind: 'topic_practice', refId: topic.topicId, targetCount: caps.topicTarget })
  }

  if (band === 'heavy' && mockSectionRefId && isWeeklyMockDay(today)) {
    items.push({ kind: 'mock_section', refId: mockSectionRefId, targetCount: 1 })
  }

  return items.slice(0, 4)
}

// ── Plan-date formatting ──────────────────────────────────────────────────────

/** 'YYYY-MM-DD' in the device's LOCAL calendar day — the study_plan_items.planDate key. */
export function formatPlanDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ── Completion matching (used by services/studyPlan.ts's mark-done bookkeeping) ─

export interface PlanItemRef {
  kind: StudyPlanItemKind
  refId: string
}

export interface SessionCompletionSignal {
  topicId: string
  listingSlug: string
  subtest: string | null
}

/**
 * itemMatchesSession — does a just-completed practice_sessions row satisfy
 * this plan item? srs_review is intentionally excluded here (see
 * itemMatchesSrsReview) — SRS reviews are recorded through flashcard_srs, not
 * practice_sessions, so they're matched by a separate, simpler signal.
 */
export function itemMatchesSession(item: PlanItemRef, session: SessionCompletionSignal): boolean {
  switch (item.kind) {
    case 'topic_practice':
      return session.topicId !== '' && session.topicId === item.refId
    case 'mock_section':
      return !!session.subtest && session.listingSlug === item.refId
    // A diagnostic item's job is "get the user practicing something to
    // establish a baseline" — ANY completed session fulfills it, so it never
    // sits half-finished when noSignal state already gated its generation.
    case 'diagnostic':
      return true
    case 'srs_review':
      return false
  }
}

/** Does a just-recorded batch of flashcard_srs reviews satisfy this item? */
export function itemMatchesSrsReview(item: PlanItemRef, reviewCount: number): boolean {
  return item.kind === 'srs_review' && reviewCount > 0
}

// ── Notification copy (services/notifications.ts's dynamic daily body) ───────

/**
 * describeTopPlanItem — one-line label for the first not-yet-done item in
 * today's plan, used as the daily 9am nudge body. `topicName` is only
 * consulted for topic_practice (resolve via the caller's topic id→name map;
 * falls back to a generic phrase when unavailable, e.g. topic since deleted).
 */
export function describeTopPlanItem(item: StudyPlanItemDraft | null, topicName?: string): string {
  if (!item) return 'Keep your streak going and tackle those weak areas today!'
  switch (item.kind) {
    case 'srs_review':
      return `Review ${item.targetCount} due flashcard${item.targetCount === 1 ? '' : 's'} before they pile up`
    case 'topic_practice':
      return `Practice ${topicName ?? 'your weakest topic'} — ${item.targetCount} questions queued`
    case 'mock_section':
      return 'Timed mock section today — dress rehearsal for the real thing'
    case 'diagnostic':
      return 'Take a quick diagnostic to find your starting point'
  }
}
