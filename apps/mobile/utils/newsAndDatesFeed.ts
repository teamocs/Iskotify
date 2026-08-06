// Pure helper for Home's merged "News & Dates" section (NewsAndDates) — replaces
// the old separate "News & Events" + "Upcoming Dates" sections with one feed.
// No React, no DB — fully unit-testable.
//
// Design decision (documented since "date-sorted merge" is ambiguous across two
// axes — future deadlines vs. past-reported news): the three DATED sources
// (focused-listing dates, note reminders, future admissions events) are
// time-sensitive/actionable, so they always lead, soonest-first. General news
// rows (admissions updates with no actionable future date) fill any remaining
// slots, ranked by severity then recency — same ordering the old "News & Events"
// shortlist used. The merged list is capped to `limit` (default 5).

import { upcomingEvents, sortBySeverityThenDate } from './admissionsFeed'
import type { FeedItem } from './admissionsFeed'

export type FeedEntryKind = 'listing' | 'reminder' | 'admission' | 'news'

export interface MergedFeedEntry {
  key: string
  kind: FeedEntryKind
  title: string
  /** 'Exam' | 'Deadline' | 'Reminder' | 'Event' for dated entries; the news body for 'news'. */
  label: string
  /** Epoch ms for dated entries; null for 'news' (no actionable date). */
  date: number | null
  severity?: string
  /** Navigation hint: listing slug / note id / admission schoolSlug, as applicable. */
  slug?: string | null
  eventType?: string | null
}

export interface FocusedListingLike {
  slug: string
  title: string
  type: string
  examDate: number | null
  deadline: number | null
}

export interface NoteReminderLike {
  noteId: string
  noteTitle: string
  reminderAt: number
}

export const NEWS_AND_DATES_LIMIT = 5

export interface BuildNewsAndDatesFeedOpts {
  focusedListings: FocusedListingLike[]
  noteReminders: NoteReminderLike[]
  admissionItems: FeedItem[]
  /** Clock for "future only" filtering. Defaults to Date.now(). */
  now?: number
  limit?: number
}

export function buildNewsAndDatesFeed(opts: BuildNewsAndDatesFeedOpts): MergedFeedEntry[] {
  const now = opts.now ?? Date.now()
  const limit = opts.limit ?? NEWS_AND_DATES_LIMIT

  const listingEntries: MergedFeedEntry[] = opts.focusedListings
    .map(l => {
      const date = l.type === 'exam' ? (l.examDate ?? l.deadline) : (l.deadline ?? l.examDate)
      return {
        key: `listing-${l.slug}`,
        kind: 'listing' as const,
        title: l.title,
        label: l.type === 'exam' ? 'Exam' : 'Deadline',
        date,
        slug: l.slug,
      }
    })
    .filter(e => e.date != null && e.date >= now)

  const reminderEntries: MergedFeedEntry[] = opts.noteReminders
    .map(r => ({
      key: `reminder-${r.noteId}`,
      kind: 'reminder' as const,
      title: r.noteTitle || 'Untitled note',
      label: 'Reminder',
      date: r.reminderAt as number | null,
      slug: r.noteId,
    }))
    .filter(e => e.date != null && e.date >= now)

  // Future admissions events (urgent/important/info) folded in as dated entries.
  // `nowISO` keeps upcomingEvents' "future" check pinned to the injected clock
  // (not the real wall clock) so this function stays deterministic under test.
  const nowISO = new Date(now).toISOString().slice(0, 10)
  const futureEvents = upcomingEvents(opts.admissionItems, nowISO).filter(
    item => item.severity === 'urgent' || item.severity === 'important' || item.severity === 'info',
  )
  const admissionEntries: MergedFeedEntry[] = futureEvents
    .filter(item => item.eventDate != null)
    .map(item => {
      const ms = new Date(`${item.eventDate!}T00:00:00Z`).getTime()
      return {
        key: `admission-${item.id}`,
        kind: 'admission' as const,
        title: item.title,
        label: item.eventType === 'exam' ? 'Exam' : item.eventType === 'deadline' ? 'Deadline' : 'Event',
        date: ms,
        slug: item.schoolSlug ?? null,
        eventType: item.eventType ?? null,
      }
    })
    // Don't double-count an admissions event that lands on the same date as an
    // already-tracked listing date (mirrors the old Upcoming Dates de-dupe).
    .filter(a => !listingEntries.some(l => l.date === a.date))

  const dated = [...listingEntries, ...reminderEntries, ...admissionEntries]
    .filter(e => e.date != null && e.date >= now)
    .sort((a, b) => (a.date ?? 0) - (b.date ?? 0))

  // News rows: every admissions item not already surfaced as a dated event above,
  // ranked severity-then-recency (same as the old "News & Events" shortlist).
  const usedAdmissionIds = new Set(futureEvents.map(e => e.id))
  const newsEntries: MergedFeedEntry[] = sortBySeverityThenDate(opts.admissionItems)
    .filter(item => !usedAdmissionIds.has(item.id))
    .map(item => ({
      key: `news-${item.id}`,
      kind: 'news' as const,
      title: item.title,
      label: item.body,
      date: null,
      severity: item.severity,
      slug: item.schoolSlug ?? null,
    }))

  return [...dated, ...newsEntries].slice(0, limit)
}
