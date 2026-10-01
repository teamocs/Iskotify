import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { DeleteAccountSheet } from '../DeleteAccountSheet'
import { aria } from '../../test-utils/aria'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('@lineiconshq/free-icons', () => ({ XmarkOutlined: {}, Trash3Outlined: {} }))

const mockDeleteAccount = jest.fn()
jest.mock('../../services/deleteAccount', () => ({
  ...jest.requireActual('../../services/deleteAccount'),
  deleteAccount: (...a: unknown[]) => mockDeleteAccount(...a),
}))
jest.mock('../../hooks/useDb', () => ({ useDb: () => ({ tag: 'db' }) }))

const confirmButton = () => screen.getByRole('button', { name: 'Delete my account' })
const typeConfirm = (v: string) => fireEvent.changeText(screen.getByLabelText('Type DELETE to confirm'), v)

beforeEach(() => {
  jest.clearAllMocks()
  mockDeleteAccount.mockResolvedValue({ ok: true })
})

describe('DeleteAccountSheet', () => {
  it('renders nothing while closed', () => {
    render(<DeleteAccountSheet visible={false} onClose={jest.fn()} onDeleted={jest.fn()} />)
    expect(screen.queryByText('Delete your account?')).toBeNull()
  })

  it('says exactly what is deleted', () => {
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    expect(screen.getByText('Delete your account?')).toBeTruthy()
    expect(screen.getByText(/permanently deletes/i)).toBeTruthy()
    expect(screen.getByText(/Your account and sign-in/)).toBeTruthy()
    expect(screen.getByText(/Your cloud backup/)).toBeTruthy()
    expect(screen.getByText(/bug reports, feedback and question reports/i)).toBeTruthy()
    expect(screen.getByText(/can.t be undone/i)).toBeTruthy()
  })

  it('says what is not deleted, and that only unlinked purchase records are kept for tax', () => {
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    expect(screen.getByText(/We keep nothing about you/i)).toBeTruthy()
    expect(screen.getByText(/purchase records/i)).toBeTruthy()
    expect(screen.queryByText(/No records are legally required/i)).toBeNull()
    expect(screen.getByText(/notes on this device/i)).toBeTruthy()
    expect(screen.getByText(/analytics/i)).toBeTruthy()
  })

  it('keeps the delete button disabled until DELETE is typed exactly', () => {
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    expect(aria(confirmButton(), 'aria-disabled')).toBe(true)
    typeConfirm('delete')
    expect(aria(confirmButton(), 'aria-disabled')).toBe(true)
    typeConfirm('DELET')
    expect(aria(confirmButton(), 'aria-disabled')).toBe(true)
    typeConfirm('DELETE')
    expect(aria(confirmButton(), 'aria-disabled')).toBe(false)
  })

  it('does nothing when pressed while the word is wrong', () => {
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    typeConfirm('nope')
    fireEvent.press(confirmButton())
    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('on success calls deleteAccount once and then onDeleted', async () => {
    const onDeleted = jest.fn()
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={onDeleted} />)
    typeConfirm('DELETE')
    fireEvent.press(confirmButton())
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1))
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1)
    expect(mockDeleteAccount).toHaveBeenCalledWith({ tag: 'db' })
  })

  it('ignores a second press while the deletion is running', async () => {
    let finish: (v: unknown) => void = () => {}
    mockDeleteAccount.mockReturnValue(new Promise(r => { finish = r }))
    render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    typeConfirm('DELETE')
    fireEvent.press(confirmButton())
    fireEvent.press(confirmButton())
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1)
    await act(async () => { finish({ ok: true }) })
  })

  it('on failure shows the error, keeps the sheet open and does not call onDeleted', async () => {
    mockDeleteAccount.mockResolvedValue({ ok: false, error: "We couldn't delete your account. Nothing was changed." })
    const onDeleted = jest.fn()
    const onClose = jest.fn()
    render(<DeleteAccountSheet visible onClose={onClose} onDeleted={onDeleted} />)
    typeConfirm('DELETE')
    fireEvent.press(confirmButton())
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Nothing was changed/)).toBeTruthy()
    expect(onDeleted).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // And the student can try again.
    expect(aria(confirmButton(), 'aria-disabled')).toBe(false)
  })

  it('Cancel closes without deleting', () => {
    const onClose = jest.fn()
    render(<DeleteAccountSheet visible onClose={onClose} onDeleted={jest.fn()} />)
    fireEvent.press(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalled()
    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('clears the typed word and the error when it is reopened', async () => {
    mockDeleteAccount.mockResolvedValue({ ok: false, error: 'Nope.' })
    const { rerender } = render(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    typeConfirm('DELETE')
    fireEvent.press(confirmButton())
    await screen.findByRole('alert')
    rerender(<DeleteAccountSheet visible={false} onClose={jest.fn()} onDeleted={jest.fn()} />)
    rerender(<DeleteAccountSheet visible onClose={jest.fn()} onDeleted={jest.fn()} />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(aria(confirmButton(), 'aria-disabled')).toBe(true)
  })
})
