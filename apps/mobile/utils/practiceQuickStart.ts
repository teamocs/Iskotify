// Practice tab quick-start row (P4): Diagnostic / Sprint / Drill, plus Mistakes
// when UPCAT is in focus (Mistakes is UPCAT-only), each resolved from the
// student's focus exams. Pure: no React, no DB.

import { isSchoolFocusSlug, focusContentSlug } from './focusSlug'
import { STUDY_SPRINT_MINUTES } from './examBuilder'

export type QuickStartKey = 'diagnostic' | 'sprint' | 'drill' | 'mistakes'

export interface QuickStartTile {
  key: QuickStartKey
  title: string
  subtitle: string
  /** Where the tile goes; null = the Drill tile opens the UPCAT subtest picker. */
  href: string | null
  /** Quiet styling (Mistakes with none yet). Still tappable. */
  muted: boolean
  /** Not tappable yet: its target depends on blueprints that are still loading. */
  disabled: boolean
}

export interface QuickStartInput {
  /** Focus listing slugs in priority order (school entries "school:<id>" included). */
  focusSlugs: readonly string[]
  /** Blueprints that can be built now (services/examBlueprints listRunnableBlueprints). */
  blueprints: readonly { slug: string; acronym: string }[]
  /** Weakest practised flashcard topic in the focus scope, if any. */
  weakTopic: { id: string; name: string } | null
  /** Open mistakes; null while loading. */
  mistakesCount: number | null
  /**
   * Blueprints (or focus) are still loading: the exam-dependent tiles show a
   * neutral subtitle and are disabled, so they never flash a wrong target.
   */
  loading?: boolean
}

/** The slug UPCAT uses as a listing, a blueprint and a focus entry. */
export const UPCAT_SLUG = 'upcat'

/** Same rule as the diagnostic (utils/diagnosticTarget resolveDiagnosticTarget): the first focus exam with a runnable blueprint. */
export function primaryFocusExam(focusSlugs: readonly string[], runnableSlugs: readonly string[]): string | null {
  return focusSlugs.find(s => runnableSlugs.includes(s)) ?? null
}

/**
 * The exam the Practice tab practises for: the primary focus exam, else the
 * first exam in focus, else a school-level focus entry (it studies the general
 * entrance subjects), else null (nothing in focus). Drill and the next step
 * (utils/nextPracticeAction) both follow it.
 */
export function practiceFocusExam(focusSlugs: readonly string[], runnableSlugs: readonly string[]): string | null {
  return primaryFocusExam(focusSlugs, runnableSlugs)
    ?? focusSlugs.find(s => !isSchoolFocusSlug(s))
    ?? focusSlugs.find(isSchoolFocusSlug)
    ?? null
}

/** UPCAT is in focus when its listing is (focus_listings slug 'upcat'). */
export function upcatInFocus(focusSlugs: readonly string[]): boolean {
  return focusSlugs.includes(UPCAT_SLUG)
}

/** A quick drill of one UPCAT subtest. */
export function upcatSubtestHref(subtest: string): string {
  return `/practice/upcat/${encodeURIComponent(subtest)}?mode=quick`
}

export function quickStartTiles(input: QuickStartInput): QuickStartTile[] {
  const { focusSlugs, blueprints, weakTopic, mistakesCount, loading = false } = input
  const mistakes: QuickStartTile | null = upcatInFocus(focusSlugs)
    ? {
        key: 'mistakes',
        title: 'Mistakes',
        subtitle: mistakesCount == null ? 'Retry what you missed' : mistakesCount > 0 ? `${mistakesCount} to retry` : 'None yet',
        href: '/practice/mistakes',
        muted: mistakesCount === 0,
        disabled: false,
      }
    : null
  const withMistakes = (tiles: QuickStartTile[]) => (mistakes ? [...tiles, mistakes] : tiles)

  if (loading) {
    const pending = (key: QuickStartKey, title: string, subtitle: string): QuickStartTile =>
      ({ key, title, subtitle, href: null, muted: false, disabled: true })
    return withMistakes([
      pending('diagnostic', 'Diagnostic', 'See where you stand'),
      pending('sprint', 'Sprint', `${STUDY_SPRINT_MINUTES} min`),
      pending('drill', 'Drill', 'Quick practice'),
    ])
  }

  const primary = primaryFocusExam(focusSlugs, blueprints.map(b => b.slug))
  const primaryLabel = primary ? (blueprints.find(b => b.slug === primary)?.acronym ?? primary.toUpperCase()) : null

  // Diagnostic follows the practice focus exam: UPCAT (or nothing in focus) ->
  // the UPCAT diagnostic; another exam -> its own diagnostic when it can run
  // (a school focus: general-cet's), else its chooser, never the UPCAT one.
  const runnableSlugs = blueprints.map(b => b.slug)
  const focusExam = practiceFocusExam(focusSlugs, runnableSlugs)
  let diagnosticHref = '/practice/diagnostic'
  if (focusExam && focusExam !== UPCAT_SLUG) {
    const content = focusContentSlug(focusExam)
    diagnosticHref = runnableSlugs.includes(content)
      ? `/practice/diagnostic?exam=${encodeURIComponent(content)}`
      : `/practice/start/${encodeURIComponent(focusExam)}`
  }
  const diagnostic: QuickStartTile = {
    key: 'diagnostic',
    title: 'Diagnostic',
    subtitle: 'See where you stand',
    href: diagnosticHref,
    muted: false,
    disabled: false,
  }

  // Study Sprint starts from the exam's prestart (it has no deep link of its own).
  const sprint: QuickStartTile = {
    key: 'sprint',
    title: 'Sprint',
    subtitle: `${primaryLabel ?? 'Pick an exam'} · ${STUDY_SPRINT_MINUTES} min`,
    href: primary ? `/practice/exam/${encodeURIComponent(primary)}` : '/practice/exam',
    muted: false,
    disabled: false,
  }

  // Drill follows the same exam as Sprint/Diagnostic (practiceFocusExam): the
  // primary focus exam, else the first focus exam. That exam is UPCAT -> the
  // UPCAT subtest picker; otherwise the weakest practised topic, else that
  // exam by subject.
  const drillExam = focusExam
  let drill: QuickStartTile
  if (drillExam === UPCAT_SLUG) {
    drill = { key: 'drill', title: 'Drill', subtitle: 'Pick a UPCAT subtest', href: null, muted: false, disabled: false }
  } else if (weakTopic) {
    drill = { key: 'drill', title: 'Drill', subtitle: weakTopic.name, href: `/practice/${encodeURIComponent(weakTopic.id)}`, muted: false, disabled: false }
  } else if (drillExam) {
    // A school-level focus has no content of its own: it studies the general entrance subjects (as app/practice/start does).
    const slug = focusContentSlug(drillExam)
    drill = { key: 'drill', title: 'Drill', subtitle: 'By subject', href: `/practice/review/${encodeURIComponent(slug)}`, muted: false, disabled: false }
  } else {
    drill = { key: 'drill', title: 'Drill', subtitle: 'Choose an exam first', href: '/(tabs)/explore', muted: false, disabled: false }
  }

  return withMistakes([diagnostic, sprint, drill])
}
