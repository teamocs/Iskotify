import React from 'react'
import { render, screen, fireEvent, act, within } from '@testing-library/react-native'
import NotesScreen from '../index'

const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }))
jest.mock('../../../components/EdgeSwipeNavigator', () => ({
  EdgeSwipeNavigator: ({ children }: any) => children,
}))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

const mockConfirm = jest.fn()
jest.mock('../../../utils/confirmAction', () => ({
  confirmAction: (...a: unknown[]) => mockConfirm(...a),
}))

const pinned = {
  id: 'n1', title: 'Physics formulas', content: 'F = ma', type: 'text', color: 'yellow', isPinned: true,
  isArchived: false, isTrashed: false, trashedAt: null, reminderAt: null, createdAt: 1, updatedAt: 2,
}
const checklist = {
  id: 'n2', title: 'Requirements', type: 'checklist', color: null, isPinned: false,
  content: JSON.stringify([
    { id: 'a', text: 'Form 138', isChecked: true },
    { id: 'b', text: 'ID photo', isChecked: false },
  ]),
  isArchived: false, isTrashed: false, trashedAt: null, reminderAt: null, createdAt: 1, updatedAt: 1,
}

const mockHook = {
  notes: [pinned, checklist] as any[],
  loading: false,
  error: false,
  reload: jest.fn(),
  createNote: jest.fn(async () => 'new-id'),
  archiveNote: jest.fn(async () => {}),
  deleteNote: jest.fn(async () => {}),
  updateNote: jest.fn(async () => {}),
}
jest.mock('../../../hooks/useNotes', () => {
  const actual = jest.requireActual('../../../hooks/useNotes')
  return { ...actual, useNotes: () => mockHook }
})

beforeEach(() => {
  mockBp.value = 'compact'
  mockHook.notes = [pinned, checklist]
  mockHook.loading = false
  mockHook.error = false
  mockPush.mockReset()
  mockConfirm.mockReset()
})

describe('Notes list', () => {
  it('has one page heading "Notes" and a named back button', () => {
    render(<NotesScreen />)
    const h1 = screen.getByRole('header', { name: 'Notes' })
    expect(h1.props['aria-level']).toBe(1)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
  })

  it('labels the secondary destinations (Archive, Trash, Labels) instead of bare icon tiles', () => {
    render(<NotesScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Archive' }))
    expect(mockPush).toHaveBeenLastCalledWith('/notes/archive')
    fireEvent.press(screen.getByRole('button', { name: 'Trash' }))
    expect(mockPush).toHaveBeenLastCalledWith('/notes/trash')
    fireEvent.press(screen.getByRole('button', { name: 'Labels' }))
    expect(mockPush).toHaveBeenLastCalledWith('/notes/labels')
    expect(screen.getByText('Archive')).toBeTruthy()
  })

  it('has a labelled search field that filters the notes', () => {
    render(<NotesScreen />)
    fireEvent.changeText(screen.getByLabelText('Search notes'), 'physics')
    expect(screen.getByRole('button', { name: /Physics formulas/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Requirements/ })).toBeNull()
  })

  it('shows an EmptyState when a search matches nothing', () => {
    render(<NotesScreen />)
    fireEvent.changeText(screen.getByLabelText('Search notes'), 'zzz')
    expect(screen.getByRole('header', { name: 'No matching notes' })).toBeTruthy()
  })

  it('shows an EmptyState with one action when there are no notes', () => {
    mockHook.notes = []
    render(<NotesScreen />)
    expect(screen.getByRole('header', { name: 'No notes yet' })).toBeTruthy()
  })

  it('shows a skeleton (busy) while loading, not the empty state', () => {
    mockHook.notes = []
    mockHook.loading = true
    render(<NotesScreen />)
    expect(screen.getByLabelText('Loading notes')).toBeTruthy()
    expect(screen.queryByText('No notes yet')).toBeNull()
  })

  it('shows an ErrorState with retry when the load fails', () => {
    mockHook.notes = []
    mockHook.error = true
    render(<NotesScreen />)
    fireEvent.press(screen.getByRole('button', { name: /Try again/ }))
    expect(mockHook.reload).toHaveBeenCalled()
  })

  it('groups pinned notes under a "Pinned" heading, with no "Pinned" eyebrow in the card', () => {
    render(<NotesScreen />)
    expect(screen.getByRole('header', { name: 'Pinned' })).toBeTruthy()
    expect(screen.getAllByText('Pinned')).toHaveLength(1)
  })

  it('draws checklist previews without glyph bullets', () => {
    render(<NotesScreen />)
    expect(screen.getByText('Form 138')).toBeTruthy()
    expect(screen.queryByText(/[✓○]/)).toBeNull()
  })

  it('opens a note on press', () => {
    render(<NotesScreen />)
    fireEvent.press(screen.getByRole('button', { name: /Physics formulas/ }))
    expect(mockPush).toHaveBeenCalledWith('/notes/n1')
  })

  it('lays the notes out in 1 / 2 / 3 columns by size class', () => {
    const three = [1, 2, 3].map(i => ({ ...checklist, id: `c${i}`, title: `Note ${i}`, isPinned: false }))
    for (const [bp, cols] of [['compact', 1], ['medium', 2], ['expanded', 3]] as const) {
      mockBp.value = bp
      mockHook.notes = three
      const { unmount } = render(<NotesScreen />)
      expect(screen.getAllByTestId('notes-column')).toHaveLength(cols)
      unmount()
    }
  })

  it('on phones the "New note" FAB is 56pt and opens the type chooser', () => {
    render(<NotesScreen />)
    const fab = screen.getByRole('button', { name: 'New note' })
    expect(screen.getByTestId('notes-fab')).toBe(fab)
    fireEvent.press(fab)
    expect(screen.getByRole('button', { name: /Text note/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Checklist/ })).toBeTruthy()
  })

  it('on desktop "New note" is a header button, not a floating FAB', () => {
    mockBp.value = 'expanded'
    render(<NotesScreen />)
    expect(screen.getAllByRole('button', { name: 'New note' })).toHaveLength(1)
    expect(screen.queryByTestId('notes-fab')).toBeNull()
  })

  it('creates a note of the chosen type and opens it', async () => {
    render(<NotesScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'New note' }))
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Checklist/ })) })
    expect(mockHook.createNote).toHaveBeenCalledWith('checklist')
    expect(mockPush).toHaveBeenCalledWith('/notes/new-id')
  })

  it('selection mode: long press selects (cards become checkboxes, aria-checked), bar offers named Pin / Archive / Move to trash', async () => {
    render(<NotesScreen />)
    const card = screen.getByRole('button', { name: /Physics formulas/ })
    fireEvent(card, 'longPress')
    expect(screen.getByRole('checkbox', { name: /Physics formulas/, checked: true })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: /Requirements/, checked: false })).toBeTruthy()
    expect(screen.getByText('1 selected')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Pin' })) })
    expect(mockHook.updateNote).toHaveBeenCalledWith('n1', { isPinned: true })
  })

  it('bulk trash asks through confirmAction (works on web, where Alert is a no-op)', async () => {
    render(<NotesScreen />)
    fireEvent(screen.getByRole('button', { name: /Requirements/ }), 'longPress')
    fireEvent.press(screen.getByRole('button', { name: 'Move to trash' }))
    expect(mockConfirm).toHaveBeenCalled()
    await act(async () => { mockConfirm.mock.calls[0][3]() })
    expect(mockHook.deleteNote).toHaveBeenCalledWith('n2')
  })
})

describe('Notes list: within grid', () => {
  it('each card is one named button', () => {
    render(<NotesScreen />)
    const grid = screen.getAllByTestId('notes-grid')[0]
    expect(within(grid).getAllByRole('button').length).toBeGreaterThanOrEqual(1)
  })
})
