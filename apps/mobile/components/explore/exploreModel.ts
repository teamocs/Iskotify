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

// ── Trust: official source and exact dates (docs/brand/90_SYNTHESIS.md) ──────

/**
 * The host of an official link, for "Official site: {host}": no scheme, no
 * "www.", no path. Null for an empty, malformed or non-http(s) value, so a
 * row never names a source the data does not hold.
 */
export function sourceHost(url: string | null | undefined): string | null {
  const raw = (url ?? '').trim()
  const m = /^https?:\/\/([^/?#\s:@]+)(?::\d+)?(?:[/?#]|$)/i.exec(raw)
  if (!m) return null
  const host = (m[1] ?? '').toLowerCase().replace(/^www\./, '')
  return host.includes('.') ? host : null
}

/** "Official site: ched.gov.ph", or null when the listing has no official link. */
export function officialSourceLine(url: string | null | undefined): string | null {
  const host = sourceHost(url)
  return host ? `Official site: ${host}` : null
}

/**
 * A calm relative time for a date: "Today", "Tomorrow", "In 8 days", or
 * "Passed". Never an alarm word; null without a date.
 */
export function relativeDay(ts: number | null | undefined, now: number = Date.now()): string | null {
  const d = daysUntilDate(ts, now)
  if (d == null) return null
  if (d < 0) return 'Passed'
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  return `In ${d} days`
}

/** Short month and day for a date capsule: "Oct 20". */
export function fmtMonthDay(ts: number): string {
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
}

// ── Schools ──────────────────────────────────────────────────────────────────

const SMALL_WORDS = new Set(['of', 'the', 'and', 'de', 'la', 'del', 'in', 'for', 'at', 'ng', 'sa'])

/**
 * The letters on a school's logo tile: its acronym when it is 2 to 4
 * characters (UPLB, PUP), else the initials of its main words, at most three
 * ("University of the Philippines Diliman" → "UPD").
 */
export function schoolInitials(name: string, acronym?: string | null): string {
  const ac = (acronym ?? '').replace(/[^A-Za-z0-9]/g, '')
  if (ac.length >= 2 && ac.length <= 4) return ac.toUpperCase()
  const words = name.split(/[\s,–-]+/).filter(w => w && !SMALL_WORDS.has(w.toLowerCase()))
  const letters = words.map(w => w.replace(/[^A-Za-z0-9]/g, '').charAt(0)).filter(Boolean).join('')
  return (letters.slice(0, 3) || name.trim().charAt(0) || '?').toUpperCase()
}

// ── Featured ─────────────────────────────────────────────────────────────────

export interface FeaturableListing {
  id: string
  slug: string
  title: string
  type: string
  deadline: number | null
}

/**
 * The listing for the featured card: the soonest deadline still open among
 * one type, scholarships the student is eligible for first when `status` is
 * given. Null when nothing has an open deadline, so the card only ever shows
 * a real date from the catalog, never an invented highlight.
 */
export function pickFeatured<T extends FeaturableListing>(
  listings: readonly T[],
  type: string,
  now: number = Date.now(),
  status?: (l: T) => MatchStatus | undefined,
): T | null {
  const open = listings.filter(l => l.type === type && l.deadline != null && (daysUntilDate(l.deadline, now) ?? -1) >= 0)
  if (open.length === 0) return null
  const rank = (l: T) => (status?.(l) === 'eligible' ? 0 : 1)
  return [...open].sort((a, b) => rank(a) - rank(b) || a.deadline! - b.deadline!)[0] ?? null
}
