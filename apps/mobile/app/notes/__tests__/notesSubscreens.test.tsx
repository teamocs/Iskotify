import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import ArchiveScreen from '../archive'
import TrashScreen from '../trash'
import LabelsScreen from '../labels'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Stack: { Screen: () => null },
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

const mockConfirm = jest.fn()
jest.mock('../../../utils/confirmAction', () => ({
  confirmAction: (...a: unknown[]) => mockConfirm(...a),
}))

const note = (id: string, extra: object = {}) => ({
  id, title: `Note ${id}`, content: 'Body', type: 'text', color: 'red', isPinned: false,
  isArchived: false, isTrashed: false, trashedAt: null, reminderAt: null, createdAt: 1, updatedAt: 1, ...extra,
})

const mockHook = {
  notes: [] as any[],
  loading: false,
  error: false,
  reload: jest.fn(),
  unarchiveNote: jest.fn(async () => {}),
  deleteNote: jest.fn(async () => {}),
  restoreNote: jest.fn(async () => {}),
  permanentlyDeleteNote: jest.fn(async () => {}),
  emptyTrash: jest.fn(async () => {}),
  pruneOldTrashedNotes: jest.fn(async () => {}),
}
jest.mock('../../../hooks/useNotes', () => {
  const actual = jest.requireActual('../../../hooks/useNotes')
  return { ...actual, useNotes: () => mockHook }
})

const mockLabels = {
  labels: [] as any[],
  createLabel: jest.fn(async () => 'l9'),
  renameLabel: jest.fn(async () => {}),
  deleteLabel: jest.fn(async () => {}),
}
jest.mock('../../../hooks/useNoteLabels', () => ({ useNoteLabels: () => mockLabels }))

beforeEach(() => {
  mockBp.value = 'compact'
  mockHook.notes = []
  mockHook.loading = false
  mockHook.error = false
  mockConfirm.mockReset()
  mockLabels.labels = []
  mockLabels.createLabel.mockReset().mockResolvedValue('l9')
})

function expectOneTitle(title: string) {
  expect(screen.getAllByText(title)).toHaveLength(1)
  expect(screen.getByRole('header', { name: title }).props['aria-level']).toBe(1)
  expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
}

describe('Archive', () => {
  it('shows its title once (h1) and an EmptyState when empty', () => {
    render(<ArchiveScreen />)
    expectOneTitle('Archive')
    expect(screen.getByRole('header', { name: 'No archived notes' })).toBeTruthy()
  })

  it('rows offer named Unarchive and Move to trash actions', async () => {
    mockHook.notes = [note('a1', { isArchived: true })]
    render(<ArchiveScreen />)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Unarchive Note a1' })) })
    expect(mockHook.unarchiveNote).toHaveBeenCalledWith('a1')
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Move Note a1 to trash' })) })
    expect(mockHook.deleteNote).toHaveBeenCalledWith('a1')
  })

  it('shows a busy skeleton while loading', () => {
    mockHook.loading = true
    render(<ArchiveScreen />)
    expect(screen.getByLabelText('Loading notes')).toBeTruthy()
    expect(screen.queryByText('No archived notes')).toBeNull()
  })
})

describe('Trash', () => {
  it('shows its title once (h1) and an EmptyState when empty', () => {
    render(<TrashScreen />)
    expectOneTitle('Trash')
    expect(screen.getByRole('header', { name: 'Trash is empty' })).toBeTruthy()
    expect(mockHook.pruneOldTrashedNotes).toHaveBeenCalled()
  })

  it('restores and deletes forever with named buttons; empty trash confirms (web-safe)', async () => {
    mockHook.notes = [note('t1', { isTrashed: true })]
    render(<TrashScreen />)
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Restore Note t1' })) })
    expect(mockHook.restoreNote).toHaveBeenCalledWith('t1')
    fireEvent.press(screen.getByRole('button', { name: 'Delete Note t1 forever' }))
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    await act(async () => { mockConfirm.mock.calls[0][3]() })
    expect(mockHook.permanentlyDeleteNote).toHaveBeenCalledWith('t1')
    fireEvent.press(screen.getByRole('button', { name: 'Empty trash' }))
    await act(async () => { mockConfirm.mock.calls[1][3]() })
    expect(mockHook.emptyTrash).toHaveBeenCalled()
  })
})

describe('Labels', () => {
  it('shows its title once (h1), a labelled field and an EmptyState', () => {
    render(<LabelsScreen />)
    expectOneTitle('Labels')
    expect(screen.getByLabelText('New label')).toBeTruthy()
    expect(screen.getByRole('header', { name: 'No labels yet' })).toBeTruthy()
    expect(screen.queryByText('‹')).toBeNull()
  })

  it('adds a label with the named Add label button', async () => {
    render(<LabelsScreen />)
    fireEvent.changeText(screen.getByLabelText('New label'), 'Chemistry')
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add label' })) })
    expect(mockLabels.createLabel).toHaveBeenCalledWith('Chemistry')
  })

  it('shows a duplicate name as a field error (Alert is a no-op on web)', async () => {
    mockLabels.createLabel.mockRejectedValue(new Error('dup'))
    render(<LabelsScreen />)
    fireEvent.changeText(screen.getByLabelText('New label'), 'Math')
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Add label' })) })
    expect(screen.getByText('"Math" already exists.')).toBeTruthy()
  })

  it('renames and deletes (confirmed) with named 44pt controls', async () => {
    mockLabels.labels = [{ id: 'l1', name: 'UPCAT', createdAt: 1 }, { id: 'l2', name: 'Math', createdAt: 1 }]
    render(<LabelsScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Rename UPCAT' }))
    fireEvent.changeText(screen.getByLabelText('Label name'), 'UPCAT 2027')
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save label name' })) })
    expect(mockLabels.renameLabel).toHaveBeenCalledWith('l1', 'UPCAT 2027')

    fireEvent.press(screen.getByRole('button', { name: 'Delete Math' }))
    await act(async () => { mockConfirm.mock.calls[0][3]() })
    expect(mockLabels.deleteLabel).toHaveBeenCalledWith('l2')
  })
})
