import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QuickReminderForm } from '../QuickReminderForm'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

describe('QuickReminderForm', () => {
  const baseProps = {
    dayStartMs: new Date(2026, 10, 16).getTime(),
    onSave: jest.fn(),
    onOpenEditor: jest.fn(),
    onCancel: jest.fn(),
  }

  beforeEach(() => {
    baseProps.onSave.mockReset()
    baseProps.onOpenEditor.mockReset()
    baseProps.onCancel.mockReset()
  })

  it('disables the Save button when title is empty', () => {
    const { getByText } = render(<QuickReminderForm {...baseProps} />)
    const save = getByText('Save')
    fireEvent.press(save)
    expect(baseProps.onSave).not.toHaveBeenCalled()
  })

  it('calls onSave with title + type=text + noon-of-day reminderAt when text mode', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Review Algebra')
    fireEvent.press(getByText('Save'))
    expect(baseProps.onSave).toHaveBeenCalledTimes(1)
    const args = baseProps.onSave.mock.calls[0][0]
    expect(args.title).toBe('Review Algebra')
    expect(args.type).toBe('text')
    expect(args.content).toBe('')
    const expectedNoon = new Date(2026, 10, 16, 12).getTime()
    expect(args.reminderAt).toBe(expectedNoon)
  })

  it('switches to checklist mode when [+ Add checklist] is pressed', () => {
    const { getByText, queryByPlaceholderText } = render(<QuickReminderForm {...baseProps} />)
    expect(queryByPlaceholderText('Content (optional)')).toBeTruthy()
    fireEvent.press(getByText('+ Add checklist'))
    expect(queryByPlaceholderText('Content (optional)')).toBeNull()
    expect(queryByPlaceholderText('First item')).toBeTruthy()
  })

  it('emits type=checklist with JSON-encoded content when checklist mode is saved', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Pack')
    fireEvent.press(getByText('+ Add checklist'))
    fireEvent.changeText(getByPlaceholderText('First item'), 'Ballpens')
    fireEvent.press(getByText('Save'))
    expect(baseProps.onSave).toHaveBeenCalledTimes(1)
    const args = baseProps.onSave.mock.calls[0][0]
    expect(args.type).toBe('checklist')
    const parsed = JSON.parse(args.content)
    expect(parsed).toEqual([{ id: expect.any(String), text: 'Ballpens', isChecked: false }])
  })

  it('calls onOpenEditor when [Open in editor] is pressed (and includes current form data)', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Half-typed')
    fireEvent.press(getByText('Open in editor'))
    expect(baseProps.onOpenEditor).toHaveBeenCalledTimes(1)
    expect(baseProps.onOpenEditor.mock.calls[0][0]).toMatchObject({ title: 'Half-typed', type: 'text' })
  })
})
