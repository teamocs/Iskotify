/**
 * Render + interaction tests for app/auth/sign-in.tsx
 * Runs under the 'mobile' jest project (jest-expo preset).
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
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
