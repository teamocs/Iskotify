import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import LandingScreen from '../landing'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}))

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'cancel' }),
}))

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'iskotify://auth/callback'),
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: () => ({
    insert: jest.fn(() => ({
      values: jest.fn(() => ({
        onConflictDoUpdate: jest.fn().mockResolvedValue(undefined),
      })),
    })),
  }),
}))

describe('LandingScreen', () => {
  it('renders the app name', () => {
    render(<LandingScreen />)
    expect(screen.getByText('Iskotify')).toBeTruthy()
  })

  it('renders Google sign-in button', () => {
    render(<LandingScreen />)
    expect(screen.getByText('Continue with Google')).toBeTruthy()
  })

  it('renders skip button', () => {
    render(<LandingScreen />)
    expect(screen.getByText(/Skip for now/)).toBeTruthy()
  })

  it('renders feature pills', () => {
    render(<LandingScreen />)
    expect(screen.getByText('Flashcards')).toBeTruthy()
    expect(screen.getByText('Progress Tracking')).toBeTruthy()
  })

  it('pressing skip navigates to onboarding', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<LandingScreen />)
    fireEvent.press(screen.getByText(/Skip for now/))
    expect(router.replace).toHaveBeenCalledWith('/onboarding')
  })
})
