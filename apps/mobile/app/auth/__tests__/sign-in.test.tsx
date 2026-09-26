/**
 * Render + interaction tests for app/auth/sign-in.tsx
 * Runs under the 'mobile' jest project (jest-expo preset).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

const mockSignInWithEmail = jest.fn()
const mockSignUpWithEmail = jest.fn()
const mockSendPasswordReset = jest.fn()
const mockSignInWithGoogleWeb = jest.fn()

jest.mock('../../../services/webAuth', () => ({
  signInWithEmail: (...args: any[]) => mockSignInWithEmail(...args),
  signUpWithEmail: (...args: any[]) => mockSignUpWithEmail(...args),
  sendPasswordReset: (...args: any[]) => mockSendPasswordReset(...args),
  signInWithGoogleWeb: (...args: any[]) => mockSignInWithGoogleWeb(...args),
  isValidEmail: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
  isValidPassword: (v: string) => v.length >= 8,
}))

// One Tap no-op in tests
jest.mock('../../../hooks/useGoogleOneTap', () => ({
  useGoogleOneTap: () => undefined,
}))

beforeEach(() => {
  jest.clearAllMocks()
})

import SignInScreen from '../sign-in'
import { aria } from '../../../test-utils/aria'

// ── Render ────────────────────────────────────────────────────────────────────

describe('SignInScreen — initial render (sign-in mode)', () => {
  it('renders the app name', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Iskotify')).toBeTruthy()
  })

  it('renders Sign in and Create account tabs', () => {
    render(<SignInScreen />)
    // Both tabs exist — use getAllByText since "Sign in" also appears on submit button
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
    expect(screen.getByText('Create account')).toBeTruthy()
  })

  it('renders email and password labels', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Email address')).toBeTruthy()
    expect(screen.getByText('Password')).toBeTruthy()
  })

  it('renders Submit button in sign-in mode', () => {
    render(<SignInScreen />)
    // The main submit button shows "Sign in" as its last occurrence in the tree
    expect(screen.getAllByText('Sign in').length).toBeGreaterThan(0)
  })

  it('renders Continue with Google button', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Continue with Google')).toBeTruthy()
  })

  it('renders Forgot password link', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Forgot password?')).toBeTruthy()
  })
})

// ── Mode toggle ───────────────────────────────────────────────────────────────

describe('SignInScreen — mode toggle', () => {
  it('switching to Create account shows create account submit button text', () => {
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Create account'))
    // "Create account" now appears both in the tab and the submit button
    expect(screen.getAllByText('Create account').length).toBeGreaterThan(0)
  })

  it('Create account mode hides Forgot password', () => {
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Create account'))
    expect(screen.queryByText('Forgot password?')).toBeNull()
  })
})

// ── Validation errors ─────────────────────────────────────────────────────────

describe('SignInScreen — validation errors', () => {
  it('shows email error when email is empty and submit pressed', async () => {
    render(<SignInScreen />)
    // Press the sign-in submit button (last "Sign in" text in the tree)
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(screen.getByText('Please enter a valid email address.')).toBeTruthy()
    })
  })

  it('shows password error when password is too short', async () => {
    render(<SignInScreen />)
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('Your password')
    fireEvent.changeText(emailInput, 'user@example.com')
    fireEvent.changeText(passwordInput, 'short')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 8 characters.')).toBeTruthy()
    })
  })

  it('does not call signInWithEmail when validation fails', async () => {
    render(<SignInScreen />)
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(mockSignInWithEmail).not.toHaveBeenCalled()
    })
  })
})

// ── Sign-in success ───────────────────────────────────────────────────────────

describe('SignInScreen — sign-in success', () => {
  it('calls signInWithEmail with trimmed email and password', async () => {
    mockSignInWithEmail.mockResolvedValue({ ok: true, data: undefined })
    render(<SignInScreen />)
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('Your password')
    fireEvent.changeText(emailInput, '  user@example.com  ')
    fireEvent.changeText(passwordInput, 'password123')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith('user@example.com', 'password123')
    })
  })
})

// ── Sign-in error ─────────────────────────────────────────────────────────────

describe('SignInScreen — sign-in error', () => {
  it('shows form error from signInWithEmail', async () => {
    mockSignInWithEmail.mockResolvedValue({ ok: false, error: "Email or password doesn't match." })
    render(<SignInScreen />)
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('Your password')
    fireEvent.changeText(emailInput, 'user@example.com')
    fireEvent.changeText(passwordInput, 'password123')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(screen.getByText("Email or password doesn't match.")).toBeTruthy()
    })
  })
})

// ── Sign-up success (email confirm) ──────────────────────────────────────────

describe('SignInScreen — sign-up success with email confirmation', () => {
  it('shows the check-your-email panel when needsEmailConfirm is true', async () => {
    mockSignUpWithEmail.mockResolvedValue({ ok: true, data: { needsEmailConfirm: true } })
    render(<SignInScreen />)
    // Switch to create account mode
    fireEvent.press(screen.getByText('Create account'))
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('At least 8 characters')
    fireEvent.changeText(emailInput, 'user@example.com')
    fireEvent.changeText(passwordInput, 'password123')
    // Press "Create account" submit button — it appears in both tab + button now
    const createBtns = screen.getAllByText('Create account')
    fireEvent.press(createBtns[createBtns.length - 1])
    await waitFor(() => {
      expect(screen.getByText('Check your email')).toBeTruthy()
    })
  })

  it('shows the confirmed sign-in button in the success panel', async () => {
    mockSignUpWithEmail.mockResolvedValue({ ok: true, data: { needsEmailConfirm: true } })
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Create account'))
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('At least 8 characters')
    fireEvent.changeText(emailInput, 'user@example.com')
    fireEvent.changeText(passwordInput, 'password123')
    const createBtns = screen.getAllByText('Create account')
    fireEvent.press(createBtns[createBtns.length - 1])
    await waitFor(() => {
      expect(screen.getByText("I've confirmed — sign in")).toBeTruthy()
    })
  })
})

// ── Sign-up error ─────────────────────────────────────────────────────────────

describe('SignInScreen — sign-up error', () => {
  it('shows error from signUpWithEmail', async () => {
    mockSignUpWithEmail.mockResolvedValue({ ok: false, error: 'That email already has an account — try signing in.' })
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Create account'))
    const emailInput = screen.getByPlaceholderText('you@example.com')
    const passwordInput = screen.getByPlaceholderText('At least 8 characters')
    fireEvent.changeText(emailInput, 'user@example.com')
    fireEvent.changeText(passwordInput, 'password123')
    const createBtns = screen.getAllByText('Create account')
    fireEvent.press(createBtns[createBtns.length - 1])
    await waitFor(() => {
      expect(screen.getByText('That email already has an account — try signing in.')).toBeTruthy()
    })
  })
})

// ── Google button ─────────────────────────────────────────────────────────────

describe('SignInScreen — Google sign-in', () => {
  it('calls signInWithGoogleWeb when Continue with Google is pressed', async () => {
    mockSignInWithGoogleWeb.mockResolvedValue({ ok: true, data: undefined })
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Continue with Google'))
    await waitFor(() => {
      expect(mockSignInWithGoogleWeb).toHaveBeenCalled()
    })
  })
})

// ── Password show/hide ────────────────────────────────────────────────────────

describe('SignInScreen — password visibility toggle', () => {
  it('Show password button is present', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Show')).toBeTruthy()
  })

  it('pressing Show toggles to Hide', () => {
    render(<SignInScreen />)
    fireEvent.press(screen.getByText('Show'))
    expect(screen.getByText('Hide')).toBeTruthy()
  })
})

// ── Redesign M2 ───────────────────────────────────────────────────────────────

describe('SignInScreen — redesign M2', () => {
  it('carries the approved tagline and no retired AI claim', () => {
    render(<SignInScreen />)
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    expect(screen.queryByText(/AI-powered/i)).toBeNull()
  })

  it('the mode switch is a tablist whose tabs expose aria-selected', () => {
    render(<SignInScreen />)
    expect(aria(screen.getByRole('tab', { name: 'Sign in' }), 'aria-selected')).toBe(true)
    expect(aria(screen.getByRole('tab', { name: 'Create account' }), 'aria-selected')).toBe(false)
    fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))
    expect(aria(screen.getByRole('tab', { name: 'Create account' }), 'aria-selected')).toBe(true)
  })

  it('labels fields visibly and sets the right autocomplete for password managers', () => {
    render(<SignInScreen />)
    const email = screen.getByLabelText('Email address')
    expect(email.props.autoComplete).toBe('email')
    expect(email.props.textContentType).toBe('emailAddress')
    expect(email.props.inputMode).toBe('email')
    const pw = screen.getByLabelText('Password')
    expect(pw.props.autoComplete).toBe('current-password')
    expect(pw.props.textContentType).toBe('password')
    fireEvent.press(screen.getByRole('tab', { name: 'Create account' }))
    const newPw = screen.getByLabelText('Password')
    expect(newPw.props.autoComplete).toBe('new-password')
    expect(newPw.props.textContentType).toBe('newPassword')
  })

  it('marks an invalid field and says how to fix it', async () => {
    render(<SignInScreen />)
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => {
      expect(aria(screen.getByLabelText('Email address'), 'aria-invalid')).toBe(true)
    })
  })

  it('the password toggle is a named 44pt button', () => {
    render(<SignInScreen />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeTruthy()
  })

  it('shows why the student is back here after a failed sign-in link', () => {
    const router = require('expo-router')
    router.useLocalSearchParams = () => ({ error: 'link' })
    render(<SignInScreen />)
    expect(screen.getByText(/That sign-in link didn't work/)).toBeTruthy()
    router.useLocalSearchParams = () => ({})
  })

  it('the submit button reports busy through aria-busy while signing in', async () => {
    let resolve!: (v: unknown) => void
    mockSignInWithEmail.mockReturnValue(new Promise(r => { resolve = r }))
    render(<SignInScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'password123')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => expect(aria(screen.getByRole('button', { name: 'Sign in' }), 'aria-busy')).toBe(true))
    resolve({ ok: true, data: undefined })
  })
})

describe('SignInScreen — no idle flash after success', () => {
  // The gate in _layout routes on the auth event after pulling the student's
  // data. Until then the form must stay busy, not snap back to an idle "Sign in"
  // button the student can press again.
  it('keeps the submit button busy after a successful sign-in', async () => {
    mockSignInWithEmail.mockResolvedValue({ ok: true, data: undefined })
    render(<SignInScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'password123')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => expect(mockSignInWithEmail).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
    expect(aria(screen.getByRole('button', { name: 'Sign in' }), 'aria-busy')).toBe(true)
  })

  it('still returns to idle when sign-in fails', async () => {
    mockSignInWithEmail.mockResolvedValue({ ok: false, error: 'Nope.' })
    render(<SignInScreen />)
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'user@example.com')
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'password123')
    const signInButtons = screen.getAllByText('Sign in')
    fireEvent.press(signInButtons[signInButtons.length - 1])
    await waitFor(() => expect(screen.getByText('Nope.')).toBeTruthy())
    expect(aria(screen.getByRole('button', { name: 'Sign in' }), 'aria-busy')).toBe(false)
  })
})
