import type { IconName } from '@/components/ui/Icon'

/**
 * The admin console's information architecture: one Home plus five jobs.
 * Organised by the work the Review Masters Bicol team does each day, not by
 * database table. The 19 raw reference tables live behind /admin/data.
 */

export interface NavItem { href: string; label: string; icon: IconName }
export interface NavGroup { id: 'content' | 'listings' | 'inbox' | 'audience' | 'system'; label: string; items: NavItem[] }

export const HOME_ITEM: NavItem = { href: '/admin', label: 'Home', icon: 'home' }

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'content',
    label: 'Content',
    items: [
      { href: '/admin/flashcards', label: 'Knowledge base', icon: 'book' },
      { href: '/admin/upcat/import', label: 'Import questions', icon: 'upload' },
      { href: '/admin/flashcards/drafts', label: 'Drafts', icon: 'file-pen' },
      { href: '/admin/upcat/review-queue', label: 'Review queue', icon: 'scan' },
      { href: '/admin/exam-blueprints', label: 'Exam blueprints', icon: 'blueprint' },
      { href: '/admin/sync#drive-question-bank', label: 'Drive question bank', icon: 'folder' },
    ],
  },
  {
    id: 'listings',
    label: 'Listings',
    items: [
      { href: '/admin/listings', label: 'All listings', icon: 'list' },
      { href: '/admin/listings/courses', label: 'Course tags', icon: 'tag' },
      { href: '/admin/updates', label: 'Admissions updates', icon: 'megaphone' },
    ],
  },
  {
    id: 'inbox',
    label: 'Inbox',
    items: [
      { href: '/admin/reports', label: 'Reported questions', icon: 'flag' },
      { href: '/admin/app-reports', label: 'Bug reports', icon: 'bug' },
      { href: '/admin/feedback', label: 'Feedback', icon: 'message' },
      { href: '/admin/date-contributions', label: 'Date corrections', icon: 'calendar' },
    ],
  },
  {
    id: 'audience',
    label: 'Audience',
    items: [
      { href: '/admin/users', label: 'Users', icon: 'users' },
      { href: '/admin/early-access', label: 'Early access', icon: 'mail' },
      { href: '/admin/analytics', label: 'Analytics', icon: 'chart' },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { href: '/admin/sync', label: 'Sync logs', icon: 'refresh' },
      { href: '/admin/data', label: 'Data tables', icon: 'database' },
      { href: '/admin/guide', label: 'User guide', icon: 'help' },
    ],
  },
]

export function allNavHrefs(): string[] {
  return [HOME_ITEM.href, ...NAV_GROUPS.flatMap(g => g.items.map(i => i.href))]
}

const pathOf = (href: string) => href.split(/[?#]/)[0]!

/**
 * Which nav item owns `pathname`: the longest href that is the path itself or a
 * whole-segment prefix of it. The root (Home) matches only exactly, and a plain
 * link beats an in-page anchor (#…) to the same route.
 */
export function findActiveHref(pathname: string, hrefs: readonly string[], rootHref = '/admin'): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  let best: string | null = null
  let bestLen = -1
  for (const href of hrefs) {
    const p = pathOf(href)
    const matches = p === rootHref ? path === p : path === p || path.startsWith(`${p}/`)
    if (!matches) continue
    const better = p.length > bestLen || (p.length === bestLen && best !== null && best.includes('#') && !href.includes('#'))
    if (better) { best = href; bestLen = p.length }
  }
  return best
}

/** Second key of a "g …" sequence → destination. */
export const GO_SHORTCUTS: Record<'h' | 'c' | 'i', { href: string; label: string }> = {
  h: { href: HOME_ITEM.href, label: 'Home' },
  c: { href: NAV_GROUPS[0]!.items[0]!.href, label: 'Content' },
  i: { href: NAV_GROUPS[2]!.items[0]!.href, label: 'Inbox' },
}
