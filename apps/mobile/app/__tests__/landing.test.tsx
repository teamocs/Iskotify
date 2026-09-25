import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import LandingScreen from '../landing'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

describe('LandingScreen (first impression)', () => {
  it('names the app as the page heading and carries the approved tagline', () => {
    render(<LandingScreen />)
    expect(screen.getByRole('header', { name: 'Iskotify' })).toBeTruthy()
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
  })

  it('makes no retired "AI-powered" claim', () => {
    render(<LandingScreen />)
    expect(screen.queryByText(/AI-powered/i)).toBeNull()
  })

  it('says plainly what the app is for (entrance exams, schools, scholarships)', () => {
    render(<LandingScreen />)
    expect(screen.getByText(/UPCAT/)).toBeTruthy()
    expect(screen.getByText(/Practice for the exam/)).toBeTruthy()
    expect(screen.getByText(/Find schools and scholarships/)).toBeTruthy()
    expect(screen.getByText(/Know what to do today/)).toBeTruthy()
  })

  it('offers Google sign-in as the one primary action', () => {
    render(<LandingScreen />)
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
  })

  it('lets a student start without an account, straight into onboarding', () => {
    const { router } = require('expo-router')
    jest.clearAllMocks()
    render(<LandingScreen />)
    fireEvent.press(screen.getByRole('button', { name: /Start without an account/ }))
    expect(router.replace).toHaveBeenCalledWith('/onboarding')
  })

  it('explains what signing in is for, without a cloud emoji', () => {
    render(<LandingScreen />)
    expect(screen.getByText(/Signing in backs up your progress/)).toBeTruthy()
  })
})
