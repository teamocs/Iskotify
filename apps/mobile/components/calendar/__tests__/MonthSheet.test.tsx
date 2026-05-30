import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MonthSheet, buildMonthGrid } from '../MonthSheet'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

describe('buildMonthGrid', () => {
  it('returns 6 rows × 7 columns = 42 cells', () => {
    const grid = buildMonthGrid(2026, 10) // November 2026 (month is 0-indexed)
    expect(grid.length).toBe(42)
  })

  it('first cell is on or before the 1st of the month', () => {
    const grid = buildMonthGrid(2026, 10)
    const firstOfMonth = new Date(2026, 10, 1)
    expect(grid[0]!.date.getTime()).toBeLessThanOrEqual(firstOfMonth.getTime())
  })

  it('marks in-month vs leading/trailing cells correctly', () => {
    const grid = buildMonthGrid(2026, 10)
    const inMonth = grid.filter(c => c.inMonth)
    expect(inMonth.length).toBe(30) // November has 30 days
  })
})

describe('MonthSheet', () => {
  it('renders nothing when visible=false', () => {
    const { queryByText } = render(
      <MonthSheet visible={false} onClose={jest.fn()} onDayPress={jest.fn()} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    expect(queryByText('Today')).toBeNull()
  })

  it('renders a month grid when visible', () => {
    const { getByText } = render(
      <MonthSheet visible={true} onClose={jest.fn()} onDayPress={jest.fn()} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    expect(getByText('Today')).toBeTruthy()
  })

  it('calls onDayPress with the tapped day start (midnight local)', () => {
    const onDayPress = jest.fn()
    const { getAllByLabelText } = render(
      <MonthSheet visible={true} onClose={jest.fn()} onDayPress={onDayPress} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    const cells = getAllByLabelText(/^Day /)
    expect(cells.length).toBeGreaterThan(0)
    fireEvent.press(cells[10]!)
    expect(onDayPress).toHaveBeenCalledTimes(1)
    expect(typeof onDayPress.mock.calls[0][0]).toBe('number')
    const ms = onDayPress.mock.calls[0][0] as number
    expect(new Date(ms).getHours()).toBe(0)
  })
})
