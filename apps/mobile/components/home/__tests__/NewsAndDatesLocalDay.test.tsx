/**
 * Batch C review — "Coming up" day badges count calendar days in the device's
 * local zone (Asia/Manila), not Math.ceil(ms-until / 24h).
 */
import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { NewsAndDates } from '../NewsAndDates'

process.env.TZ = 'Asia/Manila'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const manila = (d: number, h: number, m: number) => Date.UTC(2026, 9, d, h - 8, m)
const DAY = 86_400_000

afterEach(() => { jest.useRealTimers() })

function renderAt(now: number, listing: { examDate: number | null; deadline: number | null; type?: string }, reminders: { reminderAt: number }[] = []) {
  jest.useFakeTimers()
  jest.setSystemTime(now)
  return render(
    <NewsAndDates
      focusedListings={[{ slug: 'x', title: 'Exam X', type: listing.type ?? 'exam', examDate: listing.examDate, deadline: listing.deadline }]}
      noteReminders={reminders.map((r, i) => ({ noteId: `n${i}`, noteTitle: `Note ${i}`, reminderAt: r.reminderAt }))}
      admissionItems={[]}
      hasAnyFocus
      admissionsStatus="ready"
      onRetry={jest.fn()}
    />,
  )
}

describe('NewsAndDates day badge', () => {
  it('shows Today for a date-only exam on this local day, all day (00:30 / 07:59 / 08:01 / 23:59)', () => {
    const examDay = Date.UTC(2026, 9, 1)
    for (const [h, m] of [[0, 30], [7, 59], [8, 1], [23, 59]] as const) {
      const { unmount } = renderAt(manila(1, h, m), { examDate: examDay, deadline: null })
      expect(screen.getByText('Today')).toBeTruthy()
      unmount()
    }
  })

  it('shows Tomorrow for a date-only exam on the next local day, all day', () => {
    const examDay = Date.UTC(2026, 9, 2)
    for (const [h, m] of [[0, 30], [7, 59], [8, 1], [23, 59]] as const) {
      const { unmount } = renderAt(manila(1, h, m), { examDate: examDay, deadline: null })
      expect(screen.getByText('Tomorrow')).toBeTruthy()
      unmount()
    }
  })

  it('counts a reminder by local day: 00:10 tomorrow is Tomorrow at 23:59 tonight', () => {
    const { unmount } = renderAt(manila(1, 23, 59), { examDate: Date.UTC(2026, 9, 20), deadline: null }, [{ reminderAt: manila(2, 0, 10) }])
    expect(screen.getByText('Tomorrow')).toBeTruthy()
    unmount()
  })

  it('a date 3 calendar days out reads "3 days" (not rounded up by the clock hour)', () => {
    const { unmount } = renderAt(manila(1, 7, 59), { examDate: Date.UTC(2026, 9, 4), deadline: null })
    expect(screen.getByText('3 days')).toBeTruthy()
    unmount()
    void DAY
  })
})
