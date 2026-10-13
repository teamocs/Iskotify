import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import NoteEditorScreen from '../[id]'
import { Sheet } from '../../../components/ui/Sheet'
import { countPrimaryActions } from '../../../test-utils/primaryActions'
import { scheduleNoteReminder } from '../../../services/notifications'

const mockBack = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: (...a: unknown[]) => mockBack(...a), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: 'n1' }),
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

jest.mock('../../../services/notifications', () => ({
  scheduleNoteReminder: jest.fn(async () => {}),
  cancelNoteReminder: jest.fn(async () => {}),
}))

const mockConfirm = jest.fn()
jest.mock('../../../utils/confirmAction', () => ({
  confirmAction: (...a: unknown[]) => mockConfirm(...a),
}))

const mockLabels = {
  labels: [{ id: 'l1', name: 'UPCAT', createdAt: 1 }, { id: 'l2', name: 'Math', createdAt: 1 }],
  assignedLabelIds: jest.fn(async () => ['l1']),
  assignLabel: jest.fn(async () => {}),
  unassignLabel: jest.fn(async () => {}),
}
jest.mock('../../../hooks/useNoteLabels', () => ({ useNoteLabels: () => mockLabels }))

let mockRow: any
const mockSet = jest.fn()
const mockDb = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([mockRow]) }) }) }),
  update: () => ({ set: (v: unknown) => { mockSet(v); return { where: () => Promise.resolve() } } }),
}
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDb }))

async function renderLoaded() {
  render(<NoteEditorScreen />)
  await act(async () => {})
}

beforeEach(() => {
  mockBp.value = 'compact'
  mockSet.mockReset()
  mockConfirm.mockReset()
  mockBack.mockReset()
  mockRow = {
    id: 'n1', title: 'Physics formulas', content: 'F = ma', type: 'text', color: 'yellow', reminderAt: null,
  }
})

describe('Note editor', () => {
  it('has a named 44pt back button (no glyph) and a labelled title field', async () => {
    await renderLoaded()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.queryByText('\u2039')).toBeNull()
    expect(screen.getByLabelText('Note title').props.value).toBe('Physics formulas')
    expect(screen.getByLabelText('Note text').props.value).toBe('F = ma')
  })

  it('offers note colours as a named radio group; the stored colour key is checked', async () => {
    await renderLoaded()
    // A radiogroup container is not itself a focusable element (children stay
    // individually reachable), so find it by its label.
    expect(screen.getByLabelText('Note colour').props.accessibilityRole).toBe('radiogroup')
    const radios = screen.getAllByRole('radio')
    expect(radios.length).toBeGreaterThanOrEqual(4)
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1)
    expect(screen.getByRole('radio', { name: 'Amber', checked: true })).toBeTruthy()
  })

  it('maps legacy colour keys onto the same swatch (orange reads as Amber)', async () => {
    mockRow.color = 'orange'
    await renderLoaded()
    expect(screen.getByRole('radio', { name: 'Amber', checked: true })).toBeTruthy()
  })

  it('choosing a swatch stores a colour key, never a hex', async () => {
    jest.useFakeTimers()
    render(<NoteEditorScreen />)
    await act(async () => {})
    fireEvent.press(screen.getByRole('radio', { name: 'Green' }))
    await act(async () => { jest.advanceTimersByTime(600) })
    const last = mockSet.mock.calls.at(-1)?.[0]
    expect(last.color).toBe('green')
    jest.useRealTimers()
  })

  it('the toolbar actions are named buttons', async () => {
    await renderLoaded()
    for (const name of [/^Reminder/, /^Labels/, 'Archive note', 'Move note to trash']) {
      expect(screen.getByRole('button', { name })).toBeTruthy()
    }
  })

  it('moving to trash asks through confirmAction, then saves and goes back', async () => {
    await renderLoaded()
    fireEvent.press(screen.getByRole('button', { name: 'Move note to trash' }))
    expect(mockConfirm).toHaveBeenCalled()
    await act(async () => { await mockConfirm.mock.calls[0][3]() })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ isTrashed: true }))
    expect(mockBack).toHaveBeenCalled()
  })

  it('labels sheet (the P3 Sheet) lists labels as checkboxes with aria-checked in an inset group', async () => {
    await renderLoaded()
    fireEvent.press(screen.getByRole('button', { name: /^Labels/ }))
    const sheet = screen.UNSAFE_getAllByType(Sheet).find(s => s.props.title === 'Labels')!
    expect(sheet.props.visible).toBe(true)
    expect(screen.getByTestId('note-label-picker')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'UPCAT', checked: true })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Math', checked: false })).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('checkbox', { name: 'Math' })) })
    expect(mockLabels.assignLabel).toHaveBeenCalledWith('n1', 'l2')
  })

  it('reminder sheet (the P3 Sheet) offers named quick picks that schedule the reminder', async () => {
    await renderLoaded()
    fireEvent.press(screen.getByRole('button', { name: /^Reminder/ }))
    const sheet = screen.UNSAFE_getAllByType(Sheet).find(s => s.props.title === 'Set a reminder')!
    expect(sheet.props.visible).toBe(true)
    expect(screen.getByTestId('note-reminder-options')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /^Next week, / })) })
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ reminderAt: expect.any(Number) }))
    expect(scheduleNoteReminder).toHaveBeenCalledWith('n1', 'Physics formulas', expect.any(Date))
  })

  it('has no primary action while editing (autosave; every control is a tool or secondary)', async () => {
    await renderLoaded()
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(0)
    fireEvent.press(screen.getByRole('button', { name: /^Reminder/ }))
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(0)
  })

  it('a missing note shows one primary action: Back to notes', async () => {
    mockRow = undefined
    await renderLoaded()
    expect(screen.getByRole('header', { name: 'This note is gone' })).toBeTruthy()
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(1)
  })

  it('checklist: items are named checkboxes with no glyph tick, and checked count is sentence case', async () => {
    mockRow = {
      id: 'n1', title: 'Requirements', type: 'checklist', color: null, reminderAt: null,
      content: JSON.stringify([
        { id: 'a', text: 'Form 138', isChecked: true },
        { id: 'b', text: 'ID photo', isChecked: false },
      ]),
    }
    await renderLoaded()
    expect(screen.getByRole('checkbox', { name: 'Form 138', checked: true })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'ID photo', checked: false })).toBeTruthy()
    expect(screen.queryByText('\u2713')).toBeNull()
    expect(screen.getByText('1 checked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add item' })).toBeTruthy()
  })
})
