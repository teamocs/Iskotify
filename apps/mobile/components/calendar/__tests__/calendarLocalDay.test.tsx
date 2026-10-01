/**
 * C3 — the month sheet and week strip live in the device's LOCAL calendar day
 * (students are in Asia/Manila, UTC+8). Runs with the process zone pinned to
 * Manila so the old UTC-floor maths shows up as an off-by-one.
 */
import React from 'react'
import { StyleSheet, View } from 'react-native'
import { render, within } from '@testing-library/react-native'
import { MonthSheet, buildMonthGrid } from '../MonthSheet'
import { CalendarStrip } from '../CalendarStrip'

process.env.TZ = 'Asia/Manila'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001', warning: '#fa0',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

const DAY = 86_400_000
const idx = (y: number, m: number, d: number) => Date.UTC(y, m, d) / DAY

// Local wall-clock (Manila) -> instant
const manila = (y: number, m: number, d: number, h: number, min = 0) => Date.UTC(y, m, d, h - 8, min)

afterEach(() => { jest.useRealTimers() })

const numColor = (el: any) => StyleSheet.flatten(el.props.style)?.color

describe('zone sanity', () => {
  it('the test process is in Manila', () => {
    expect(new Date(2026, 9, 1, 12).getTimezoneOffset()).toBe(-480)
  })
})

describe('buildMonthGrid day indices are local calendar days', () => {
  it('the cell for 1 Oct 2026 carries the 1 Oct index (not 30 Sep)', () => {
    const grid = buildMonthGrid(2026, 9)
    const cell = grid.find(c => c.inMonth && c.date.getDate() === 1)!
    expect(cell.dayIndex).toBe(idx(2026, 9, 1))
    const last = grid.filter(c => c.inMonth).pop()!
    expect(last.dayIndex).toBe(idx(2026, 9, 31))
  })
})

describe('MonthSheet', () => {
  function renderSheet(now: number, practice: number[] = []) {
    jest.useFakeTimers({ now })
    return render(
      <MonthSheet visible onClose={jest.fn()} onDayPress={jest.fn()}
        importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set(practice)} />,
    )
  }

  it.each([
    ['00:30', manila(2026, 9, 2, 0, 30)],
    ['07:59', manila(2026, 9, 2, 7, 59)],
    ['08:01', manila(2026, 9, 2, 8, 1)],
    ['23:59', manila(2026, 9, 2, 23, 59)],
  ])('highlights 2 Oct as today at %s local', (_label, now) => {
    const { getAllByLabelText } = renderSheet(now)
    const oct2 = getAllByLabelText('Day 2')[0]! // first "2" in the grid is 2 Oct
    expect(numColor(within(oct2).getByText('2'))).toBe('#fff') // today circle uses the inverted colour
    const oct1 = getAllByLabelText('Day 1').find(el => numColor(within(el).getByText('1')) === '#fff')
    expect(oct1).toBeUndefined()
  })

  it('marks a practice day on its own date, not the next one', () => {
    const { getAllByLabelText } = renderSheet(manila(2026, 9, 5, 12), [idx(2026, 9, 1)])
    const withPractice = (label: string) => {
      const cell = getAllByLabelText(label)[0]!
      // dotsRow holds one 4px dot per marker
      return within(cell).UNSAFE_getAllByType(View)
        .filter(v => StyleSheet.flatten(v.props.style)?.backgroundColor === '#60a5fa').length
    }
    expect(withPractice('Day 1')).toBe(1)
    expect(withPractice('Day 2')).toBe(0)
  })
})

describe('CalendarStrip', () => {
  function renderStrip(now: number) {
    jest.useFakeTimers({ now })
    return render(
      <CalendarStrip importantDays={new Set()} practiceDays={new Set()} reminderDays={new Set()}
        onDayPress={jest.fn()} onHeaderPress={jest.fn()} />,
    )
  }

  it.each([
    ['00:30 (the UTC day is still yesterday)', manila(2026, 9, 2, 0, 30)],
    ['07:59', manila(2026, 9, 2, 7, 59)],
    ['08:01', manila(2026, 9, 2, 8, 1)],
    ['23:59', manila(2026, 9, 2, 23, 59)],
  ])('highlights 2 Oct, not 1 Oct, at %s local', (_label, now) => {
    const { getByLabelText } = renderStrip(now)
    expect(numColor(within(getByLabelText('Day 2')).getByText('2'))).toBe('#fff')
    expect(numColor(within(getByLabelText('Day 1')).getByText('1'))).not.toBe('#fff')
  })
})
