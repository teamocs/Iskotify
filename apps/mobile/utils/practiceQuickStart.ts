// Practice tab quick-start row (P4): four tiles, Diagnostic / Sprint / Drill /
// Mistakes, each resolved from the student's focus exams. Pure: no React, no DB.

import { isSchoolFocusSlug } from './focusSlug'
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
}

/** The slug UPCAT uses as a listing, a blueprint and a focus entry. */
export const UPCAT_SLUG = 'upcat'

/** Same rule as the diagnostic (utils/diagnosticTarget resolveDiagnosticTarget): the first focus exam with a runnable blueprint. */
export function primaryFocusExam(focusSlugs: readonly string[], runnableSlugs: readonly string[]): string | null {
  return focusSlugs.find(s => runnableSlugs.includes(s)) ?? null
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
  const { focusSlugs, blueprints, weakTopic, mistakesCount } = input
  const primary = primaryFocusExam(focusSlugs, blueprints.map(b => b.slug))
  const primaryLabel = primary ? (blueprints.find(b => b.slug === primary)?.acronym ?? primary.toUpperCase()) : null

  const diagnostic: QuickStartTile = {
    key: 'diagnostic',
    title: 'Diagnostic',
    subtitle: 'See where you stand',
    href: primary && primary !== UPCAT_SLUG ? `/practice/diagnostic?exam=${encodeURIComponent(primary)}` : '/practice/diagnostic',
    muted: false,
  }

  // Study Sprint starts from the exam's prestart (it has no deep link of its own).
  const sprint: QuickStartTile = {
    key: 'sprint',
    title: 'Sprint',
    subtitle: `${primaryLabel ?? 'Pick an exam'} · ${STUDY_SPRINT_MINUTES} min`,
    href: primary ? `/practice/exam/${encodeURIComponent(primary)}` : '/practice/exam',
    muted: false,
  }

  const firstExamFocus = focusSlugs.find(s => !isSchoolFocusSlug(s)) ?? null
  const hasSchoolFocus = focusSlugs.some(isSchoolFocusSlug)
  let drill: QuickStartTile
  if (upcatInFocus(focusSlugs)) {
    drill = { key: 'drill', title: 'Drill', subtitle: 'Pick a UPCAT subtest', href: null, muted: false }
  } else if (weakTopic) {
    drill = { key: 'drill', title: 'Drill', subtitle: weakTopic.name, href: `/practice/${encodeURIComponent(weakTopic.id)}`, muted: false }
  } else if (firstExamFocus || hasSchoolFocus) {
    // A school-level focus has no content of its own: it studies the general entrance subjects (as app/practice/start does).
    const slug = firstExamFocus ?? 'general-cet'
    drill = { key: 'drill', title: 'Drill', subtitle: 'By subject', href: `/practice/review/${encodeURIComponent(slug)}`, muted: false }
  } else {
    drill = { key: 'drill', title: 'Drill', subtitle: 'Choose an exam first', href: '/(tabs)/explore', muted: false }
  }

  const mistakes: QuickStartTile = {
    key: 'mistakes',
    title: 'Mistakes',
    subtitle: mistakesCount == null ? 'Retry what you missed' : mistakesCount > 0 ? `${mistakesCount} to retry` : 'None yet',
    href: '/practice/mistakes',
    muted: mistakesCount === 0,
  }

  return [diagnostic, sprint, drill, mistakes]
}
