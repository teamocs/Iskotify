import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { DateActionSheet } from '../DateActionSheet'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

jest.mock('../../../hooks/useDateReminders', () => ({
  useDateReminders: jest.fn(() => ({ exams: [], reminders: [] })),
}))

const { useDateReminders } = jest.requireMock('../../../hooks/useDateReminders') as { useDateReminders: jest.Mock }

const dayStartMs = new Date(2026, 10, 16).getTime()

describe('DateActionSheet', () => {
  beforeEach(() => useDateReminders.mockReset())

  it('renders nothing when visible=false', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const { queryByText } = render(
      <DateActionSheet
        visible={false}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onSaveAndOpenEditor={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(queryByText(/Add reminder/)).toBeNull()
    expect(queryByText(/Save/)).toBeNull()
  })

  it('renders QuickReminderForm when the day has no items', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const { getByText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onSaveAndOpenEditor={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByPlaceholderText("What's the reminder?")).toBeTruthy()
    expect(getByText('Save')).toBeTruthy()
  })

  it('renders DayItemsList when the day has items', () => {
    useDateReminders.mockReturnValue({
      exams: [{ slug: 'upcat', title: 'UPCAT 2026', label: 'Exam', date: dayStartMs + 9 * 3_600_000 }],
      reminders: [],
    })
    const { getByText, queryByPlaceholderText, getByLabelText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onSaveAndOpenEditor={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText(/UPCAT 2026/)).toBeTruthy()
    expect(getByLabelText('Add a new reminder for this day')).toBeTruthy()
    expect(queryByPlaceholderText("What's the reminder?")).toBeNull()
  })

  it('toggles from list-mode to form-mode when [+ Add reminder] is tapped', () => {
    useDateReminders.mockReturnValue({
      exams: [{ slug: 'upcat', title: 'UPCAT 2026', label: 'Exam', date: dayStartMs + 9 * 3_600_000 }],
      reminders: [],
    })
    const { getByLabelText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onSaveAndOpenEditor={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByLabelText('Add a new reminder for this day'))
    expect(getByPlaceholderText("What's the reminder?")).toBeTruthy()
  })

  it('proxies onSaveReminder when Save is tapped in form mode', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const onSaveReminder = jest.fn()
    const { getByText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={onSaveReminder}
        onSaveAndOpenEditor={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Test')
    fireEvent.press(getByText('Save'))
    expect(onSaveReminder).toHaveBeenCalledTimes(1)
  })
})
