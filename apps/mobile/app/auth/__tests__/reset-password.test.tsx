import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (p: string) => mockReplace(p) },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockGetSession = jest.fn()
jest.mock('../../../services/supabase', () => ({
  supabase: { auth: { getSession: () => mockGetSession() } },
}))

const mockUpdatePassword = jest.fn()
jest.mock('../../../services/webAuth', () => ({
  updatePassword: (p: string) => mockUpdatePassword(p),
  isValidPassword: (v: string) => v.length >= 8,
}))

const mockCheckPwnedPassword = jest.fn()
jest.mock('../../../services/pwnedPasswords', () => ({
  ...jest.requireActual('../../../services/pwnedPasswords'),
  checkPwnedPassword: (p: string) => mockCheckPwnedPassword(p),
}))

import ResetPasswordScreen from '../reset-password'
import { aria } from '../../../test-utils/aria'

beforeEach(() => {
  jest.clearAllMocks()
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u' } } } })
  mockCheckPwnedPassword.mockResolvedValue({ checked: true, breached: false, count: 0 })
})

describe('ResetPasswordScreen', () => {
  it('announces that it is checking the link while it looks for a session', () => {
    mockGetSession.mockReturnValue(new Promise(() => {}))
    render(<ResetPasswordScreen />)
    expect(screen.getByText('Checking your reset link…')).toBeTruthy()
  })

  it('explains an expired link and offers the way back', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } })
    render(<ResetPasswordScreen />)
    expect(await screen.findByRole('header', { name: 'This reset link has expired' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back to sign in' }))
    expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('both password fields are new-password fields for password managers', async () => {
    render(<ResetPasswordScreen />)
    const pw = await screen.findByLabelText('New password')
    const confirm = screen.getByLabelText('Confirm new password')
    for (const f of [pw, confirm]) {
      expect(f.props.autoComplete).toBe('new-password')
      expect(f.props.textContentType).toBe('newPassword')
    }
  })

  it('has a show/hide toggle that reveals both fields together', async () => {
    render(<ResetPasswordScreen />)
    await screen.findByLabelText('New password')
    expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('New password').props.secureTextEntry).toBe(false)
    expect(screen.getByLabelText('Confirm new password').props.secureTextEntry).toBe(false)
  })

  it('says exactly what is wrong with a mismatch and marks the field invalid', async () => {
    render(<ResetPasswordScreen />)
    fireEvent.changeText(await screen.findByLabelText('New password'), 'password123')
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'password124')
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText("These passwords don't match. Type the same password in both fields.")).toBeTruthy()
    expect(aria(screen.getByLabelText('Confirm new password'), 'aria-invalid')).toBe(true)
    expect(mockUpdatePassword).not.toHaveBeenCalled()
  })

  it('updates the password and confirms success', async () => {
    mockUpdatePassword.mockResolvedValue({ ok: true, data: undefined })
    render(<ResetPasswordScreen />)
    fireEvent.changeText(await screen.findByLabelText('New password'), 'password123')
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'password123')
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }))
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('password123'))
    expect(await screen.findByRole('header', { name: 'Password updated' })).toBeTruthy()
  })
})

describe('ResetPasswordScreen — leaked-password check', () => {
  const BREACHED = 'This password has appeared in a known data breach. Please choose a different one.'

  async function submit(pw = 'password123') {
    fireEvent.changeText(await screen.findByLabelText('New password'), pw)
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), pw)
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }))
  }

  it('a breached password blocks the update with an inline error on the new-password field', async () => {
    mockCheckPwnedPassword.mockResolvedValue({ checked: true, breached: true, count: 12 })
    render(<ResetPasswordScreen />)
    await submit()
    expect(await screen.findByText(BREACHED)).toBeTruthy()
    expect(mockCheckPwnedPassword).toHaveBeenCalledWith('password123')
    expect(mockUpdatePassword).not.toHaveBeenCalled()
    expect(aria(screen.getByLabelText('New password'), 'aria-invalid')).toBe(true)
    expect(aria(screen.getByRole('button', { name: 'Set new password' }), 'aria-busy')).toBe(false)
  })

  it('an HIBP outage still lets the reset proceed', async () => {
    mockCheckPwnedPassword.mockResolvedValue({ checked: false, breached: false, count: 0 })
    mockUpdatePassword.mockResolvedValue({ ok: true, data: undefined })
    render(<ResetPasswordScreen />)
    await submit()
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('password123'))
    expect(await screen.findByRole('header', { name: 'Password updated' })).toBeTruthy()
  })

  it('an unexpected rejection from the check still lets the reset proceed', async () => {
    mockCheckPwnedPassword.mockRejectedValue(new Error('boom'))
    mockUpdatePassword.mockResolvedValue({ ok: true, data: undefined })
    render(<ResetPasswordScreen />)
    await submit()
    await waitFor(() => expect(mockUpdatePassword).toHaveBeenCalledWith('password123'))
  })

  it('does not check when the passwords do not match', async () => {
    render(<ResetPasswordScreen />)
    fireEvent.changeText(await screen.findByLabelText('New password'), 'password123')
    fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'password124')
    fireEvent.press(screen.getByRole('button', { name: 'Set new password' }))
    expect(await screen.findByText("These passwords don't match. Type the same password in both fields.")).toBeTruthy()
    expect(mockCheckPwnedPassword).not.toHaveBeenCalled()
  })
})
