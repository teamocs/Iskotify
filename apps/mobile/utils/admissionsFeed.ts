export interface FeedItem {
  id: string
  reportDate: string
  severity: string
  title: string
  body: string
  eventDate: string | null
  eventType: string | null
  schoolSlug?: string | null
  schoolName?: string | null
  actionRequired?: string | null
  sources?: any
}

export const SEVERITY_ORDER: Record<string, number> = {
  urgent: 0,
  important: 1,
  info: 2,
  no_change: 3,
}

/** Parse a YYYY-MM-DD string as UTC midnight to avoid timezone drift. */
function parseUTCDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Returns whole days between dateISO and todayISO (future = positive, past = negative). */
export function daysUntil(dateISO: string, todayISO?: string): number {
  const today = todayISO ?? new Date().toISOString().slice(0, 10)
  const target = parseUTCDate(dateISO).getTime()
  const base = parseUTCDate(today).getTime()
  return Math.round((target - base) / (1000 * 60 * 60 * 24))
}

/** Sort by SEVERITY_ORDER asc, then reportDate desc. Does not mutate input. */
export function sortBySeverityThenDate(items: FeedItem[]): FeedItem[] {
  return [...items].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity] ?? 99
    const sb = SEVERITY_ORDER[b.severity] ?? 99
    if (sa !== sb) return sa - sb
    return b.reportDate.localeCompare(a.reportDate)
  })
}

/** Filter to items with a non-null eventDate that is today or in the future, sorted by eventDate asc. */
export function upcomingEvents(items: FeedItem[], todayISO?: string): FeedItem[] {
  const today = todayISO ?? new Date().toISOString().slice(0, 10)
  return items
    .filter((item) => item.eventDate !== null && daysUntil(item.eventDate!, today) >= 0)
    .sort((a, b) => a.eventDate!.localeCompare(b.eventDate!))
}
