import {
  Home2Outlined,
  Pencil1Outlined,
  Search1Outlined,
  TrendUp1Outlined,
} from '@lineiconshq/free-icons'

/**
 * The app's four top-level destinations (redesign direction C, owner-approved
 * 2026-09). Named after the student's jobs, not the data:
 *   Today    — the plan, the one countdown, the next step
 *   Practice — mocks, drills, due cards, the estimator
 *   Explore  — schools & exams, scholarships, courses, destinations, news & dates
 *   Progress — readiness and analytics
 * Profile is reached from the avatar in every tab header (and the web sidebar).
 */
export type TabName = 'index' | 'practice' | 'explore' | 'progress'

export interface Destination {
  name: TabName
  label: string
  icon: typeof Home2Outlined
  /** Pathname to push (web sidebar) — the URL the tab lives at. */
  href: string
}

export const TAB_DESTINATIONS: readonly Destination[] = [
  { name: 'index',    label: 'Today',    icon: Home2Outlined,    href: '/' },
  { name: 'practice', label: 'Practice', icon: Pencil1Outlined,  href: '/practice' },
  { name: 'explore',  label: 'Explore',  icon: Search1Outlined,  href: '/explore' },
  { name: 'progress', label: 'Progress', icon: TrendUp1Outlined, href: '/progress' },
]

/**
 * Legacy tab routes that still exist (as redirects) for deep links and
 * notifications, mapped to the destination that now owns their content.
 */
export const LEGACY_ROUTE_OWNER: Record<string, TabName> = {
  listings: 'explore',
  updates: 'explore',
  analytics: 'progress',
}

/** Which destination a route name belongs to (null for Profile and non-tabs). */
export function destinationForRoute(routeName: string): TabName | null {
  if (TAB_DESTINATIONS.some(d => d.name === routeName)) return routeName as TabName
  return LEGACY_ROUTE_OWNER[routeName] ?? null
}

/** Which destination a pathname belongs to (web sidebar highlighting). */
export function activeDestination(pathname: string): TabName | null {
  const clean = pathname.replace(/^\/\(tabs\)/, '') || '/'
  if (clean === '/' || clean === '/index') return 'index'
  const first = clean.split('/')[1] ?? ''
  return destinationForRoute(first)
}

/** Explore sections. Keys match the legacy Lists `?tab=` values plus `news`. */
export const EXPLORE_SECTIONS = ['universities', 'scholarships', 'courses', 'destinations', 'news'] as const
export type ExploreSection = typeof EXPLORE_SECTIONS[number]

export function parseExploreSection(v: unknown): ExploreSection | null {
  return typeof v === 'string' && (EXPLORE_SECTIONS as readonly string[]).includes(v) ? (v as ExploreSection) : null
}

/** `/listings?tab=x` → `/explore?section=x` (unknown or missing tab → `/explore`). */
export function exploreHrefForLegacyTab(tab: unknown): string {
  const section = parseExploreSection(tab)
  return section && section !== 'news' ? `/explore?section=${section}` : '/explore'
}
