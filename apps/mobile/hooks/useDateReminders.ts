import { useState, useEffect } from 'react'
import { eq, and, gte, lt } from 'drizzle-orm'
import { useDb } from './useDb'
import { notes as notesTable, listings as listingsTable } from '../db/schema'

export interface DayExam {
  slug: string
  title: string
  label: 'Exam' | 'Deadline'
  date: number
}

export interface DayReminder {
  noteId: string
  noteTitle: string
  reminderAt: number
  type: 'text' | 'checklist'
}

export interface DayItems {
  exams: DayExam[]
  reminders: DayReminder[]
}

interface FilterInput {
  dayStartMs: number
  dayEndMs: number   // exclusive upper bound
  reminders: Array<{ noteId: string; noteTitle: string; reminderAt: number; type: 'text' | 'checklist' }>
  listings: Array<{ slug: string; title: string; type: string; examDate: number | null; deadline: number | null }>
}

/**
 * Pure: filter a flat reminders[] + listings[] down to what falls on a single calendar day.
 * Exported so it can be unit-tested without mocking Drizzle.
 */
export function filterDayItems(input: FilterInput): DayItems {
  const { dayStartMs, dayEndMs, reminders, listings } = input
  const inDay = (ms: number | null | undefined): ms is number =>
    typeof ms === 'number' && ms >= dayStartMs && ms < dayEndMs

  const matchedReminders: DayReminder[] = reminders
    .filter(r => inDay(r.reminderAt))
    .sort((a, b) => a.reminderAt - b.reminderAt)

  const matchedExams: DayExam[] = []
  for (const l of listings) {
    if (inDay(l.examDate)) {
      matchedExams.push({ slug: l.slug, title: l.title, label: 'Exam', date: l.examDate })
    }
    if (inDay(l.deadline)) {
      matchedExams.push({ slug: l.slug, title: l.title, label: 'Deadline', date: l.deadline })
    }
  }

  return { exams: matchedExams, reminders: matchedReminders }
}

/**
 * Reactive hook: query the local DB for a given day's reminders + listing hits.
 * Day boundary uses device local time (matches what the user sees on the calendar).
 *
 * Pass `null` when there's no active day → returns empty + skips DB work.
 */
export function useDateReminders(dayStartMs: number | null): DayItems {
  const db = useDb()
  const [data, setData] = useState<DayItems>({ exams: [], reminders: [] })

  useEffect(() => {
    if (dayStartMs == null) {
      setData({ exams: [], reminders: [] })
      return
    }
    const dayEndMs = dayStartMs + 86_400_000

    let cancelled = false
    void (async () => {
      try {
        const [remRows, lstRows] = await Promise.all([
          db.select({
              id: notesTable.id,
              title: notesTable.title,
              reminderAt: notesTable.reminderAt,
              type: notesTable.type,
            })
            .from(notesTable)
            .where(and(
              eq(notesTable.isArchived, false),
              eq(notesTable.isTrashed, false),
              gte(notesTable.reminderAt, dayStartMs),
              lt(notesTable.reminderAt, dayEndMs),
            )),
          db.select({
              slug: listingsTable.slug,
              title: listingsTable.title,
              type: listingsTable.type,
              examDate: listingsTable.examDate,
              deadline: listingsTable.deadline,
            })
            .from(listingsTable),
        ])
        if (cancelled) return
        const reminders = remRows.map(r => ({
          noteId: r.id,
          noteTitle: r.title || 'Untitled note',
          reminderAt: r.reminderAt ?? 0,
          type: (r.type === 'checklist' ? 'checklist' : 'text') as 'text' | 'checklist',
        }))
        const listings = lstRows.map(l => ({
          slug: l.slug,
          title: l.title,
          type: l.type,
          examDate: l.examDate,
          deadline: l.deadline,
        }))
        setData(filterDayItems({ dayStartMs, dayEndMs, reminders, listings }))
      } catch (err) {
        console.error('[useDateReminders] error:', err)
      }
    })()
    return () => { cancelled = true }
  }, [db, dayStartMs])

  return data
}
