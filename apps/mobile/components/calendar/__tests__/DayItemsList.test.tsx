import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { DayItemsList } from '../DayItemsList'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

const baseExams = [
  { slug: 'upcat', title: 'UPCAT 2026', label: 'Exam' as const, date: new Date(2026, 10, 16, 8).getTime() },
]
const baseReminders = [
  { noteId: 'n1', noteTitle: 'Review chem', reminderAt: new Date(2026, 10, 16, 9).getTime(), type: 'text' as const },
  { noteId: 'n2', noteTitle: 'Pack pens',  reminderAt: new Date(2026, 10, 16, 7).getTime(), type: 'checklist' as const },
]

describe('DayItemsList', () => {
  it('renders exam pills with the listing title', () => {
    const { getByText } = render(
      <DayItemsList
        exams={baseExams}
        reminders={[]}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText(/UPCAT 2026/)).toBeTruthy()
  })

  it('calls onTapExam with the slug when an exam pill is tapped', () => {
    const onTapExam = jest.fn()
    const { getByText } = render(
      <DayItemsList
        exams={baseExams}
        reminders={[]}
        onTapExam={onTapExam}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText(/UPCAT 2026/))
    expect(onTapExam).toHaveBeenCalledWith('upcat')
  })

  it('renders each reminder row', () => {
    const { getByText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText('Review chem')).toBeTruthy()
    expect(getByText('Pack pens')).toBeTruthy()
  })

  it('calls onTapReminder with noteId when a reminder row is tapped', () => {
    const onTapReminder = jest.fn()
    const { getByText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={onTapReminder}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText('Review chem'))
    expect(onTapReminder).toHaveBeenCalledWith('n1')
  })

  it('calls onDeleteReminder with noteId when delete affordance is pressed', () => {
    const onDeleteReminder = jest.fn()
    const { getAllByLabelText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={onDeleteReminder}
      />
    )
    const deletes = getAllByLabelText(/Delete reminder/)
    expect(deletes.length).toBe(2)
    fireEvent.press(deletes[0]!)
    expect(onDeleteReminder).toHaveBeenCalled()
  })

  it('calls onTapAdd when [+ Add reminder] is pressed', () => {
    const onTapAdd = jest.fn()
    const { getByLabelText } = render(
      <DayItemsList
        exams={[]}
        reminders={[]}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={onTapAdd}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByLabelText('Add a new reminder for this day'))
    expect(onTapAdd).toHaveBeenCalledTimes(1)
  })
})
