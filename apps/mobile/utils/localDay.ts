// Local-calendar-day helpers. Students are in Asia/Manila (UTC+8): a plain
// Math.floor(ms / 86_400_000) is the UTC day, which is "yesterday" from 00:00 to
// 08:00 local. Every day index in the app is floor((ms + offset) / DAY) so
// practice days, "today", reminders and exam dates all live in one calendar.
//
// Every helper takes an explicit offset (default: the device's current one) so
// tests can pin +8h regardless of the machine's zone.

export const DAY_MS = 86_400_000

/**
 * Milliseconds to ADD to an epoch timestamp so floor((ts + offset) / DAY_MS)
 * buckets it into the device's LOCAL calendar day. PH (UTC+8) -> +8h. Read at
 * call time, never cached across days.
 */
export function localDayOffsetMs(): number {
  return -new Date().getTimezoneOffset() * 60_000
}

/** Day index (days since 1970-01-01 of the LOCAL calendar date) of an instant. */
export function localDayIndex(ms: number, offsetMs: number = localDayOffsetMs()): number {
  return Math.floor((ms + offsetMs) / DAY_MS)
}

/** 'YYYY-MM-DD' of the LOCAL calendar date of an instant. */
export function localDateISO(ms: number, offsetMs: number = localDayOffsetMs()): string {
  return new Date(ms + offsetMs).toISOString().slice(0, 10)
}

/**
 * Day index of a date-only value ('YYYY-MM-DD', stored by sync as UTC midnight
 * of that date). The calendar date itself is what matters, so this is the plain
 * UTC floor — the same calendar localDayIndex counts in.
 */
export function calendarDayIndex(dateOnlyMs: number): number {
  return Math.floor(dateOnlyMs / DAY_MS)
}

/** Whole calendar days from "now" (local day) to a date-only value; 0 all through that day. */
export function daysUntilDate(dateOnlyMs: number, now: number, offsetMs: number = localDayOffsetMs()): number {
  return calendarDayIndex(dateOnlyMs) - localDayIndex(now, offsetMs)
}

/** Day index of a JS Date's own local calendar fields (zone-independent grid maths). */
export function localDayIndexOfDate(d: Date): number {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS)
}
