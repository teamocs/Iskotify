import type { Breakpoint } from '../../hooks/useBreakpoint'
import type { ExploreSection } from '../navigation/destinations'
import type { MatchStatus } from '../../utils/scholarshipMatch'

/**
 * Pure presentation rules for Explore (redesign M2). No React, no theme:
 * everything here is unit-tested in isolation.
 */

export type BadgeTone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'
export interface BadgeSpec { label: string; tone: BadgeTone }

/** Grid columns per size class: phone list, tablet 2-up, desktop 3-up. */
export function exploreColumns(bp: Breakpoint): 1 | 2 | 3 {
  if (bp === 'expanded') return 3
  if (bp === 'medium') return 2
  return 1
}

const DAY_MS = 86_400_000

function startOfDay(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Whole calendar days from `now` to `ts` (negative once passed); null without a date. */
export function daysUntilDate(ts: number | null | undefined, now: number = Date.now()): number | null {
  if (ts == null) return null
  return Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS)
}

/**
 * How soon a date is, as a short badge. Urgent-but-not-alarming (PRODUCT.md):
 * red only for today/tomorrow, amber within a week, neutral within a month,
 * nothing beyond that. A passed date is neutral — it is information, not a failure.
 */
export function dateUrgency(ts: number | null | undefined, now: number = Date.now()): BadgeSpec | null {
  const d = daysUntilDate(ts, now)
  if (d == null) return null
  if (d < 0) return { label: 'Passed', tone: 'neutral' }
  if (d === 0) return { label: 'Today', tone: 'danger' }
  if (d === 1) return { label: 'Tomorrow', tone: 'danger' }
  if (d <= 7) return { label: `In ${d} days`, tone: 'warning' }
  if (d <= 30) return { label: `In ${d} days`, tone: 'neutral' }
  return null
}

/** Scholarship eligibility as a labelled badge; the words carry the meaning, not the colour. */
export function matchBadge(status: MatchStatus): BadgeSpec | null {
  switch (status) {
    case 'eligible': return { label: 'Eligible', tone: 'success' }
    case 'maybe': return { label: 'Maybe eligible', tone: 'warning' }
    case 'ineligible': return { label: 'Not eligible', tone: 'neutral' }
    default: return null
  }
}

/** Short date for cards: "Aug 10, 2027". */
export function fmtShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Long date for detail pages: "Tue, August 10, 2027". */
export function fmtLongDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-PH', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })
}

type SearchableSection = Exclude<ExploreSection, 'news'>

/** Each section's search field: an accessible name plus a short example placeholder. */
export const SECTION_SEARCH: Record<SearchableSection, { label: string; placeholder: string }> = {
  universities: { label: 'Search schools and exams', placeholder: 'Name or acronym, e.g. UPLB' },
  scholarships: { label: 'Search scholarships', placeholder: 'Try "full scholarship for STEM"' },
  courses: { label: 'Filter courses', placeholder: 'Filter courses' },
  destinations: { label: 'Filter destinations', placeholder: 'Filter destinations' },
}

/** Trim a query for display inside a heading so long input doesn't overflow. */
export function truncateQuery(q: string, max = 32): string {
  const t = q.trim()
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t
}
