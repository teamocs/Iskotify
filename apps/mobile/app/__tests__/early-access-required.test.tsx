import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Linking } from 'react-native'
import EarlyAccessRequiredScreen from '../early-access-required'

const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (p: string) => mockReplace(p) },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// Supabase — only signOut is exercised by this screen.
const mockSignOut = jest.fn().mockResolvedValue({})
jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signOut: () => mockSignOut(),
    },
  },
}))

describe('EarlyAccessRequiredScreen', () => {
  beforeEach(() => {
    mockReplace.mockClear()
    mockSignOut.mockClear()
  })

  it('renders the heading', () => {
    render(<EarlyAccessRequiredScreen />)
    expect(screen.getByText('Early access required')).toBeTruthy()
  })

  it('renders the Register for early access button', () => {
    render(<EarlyAccessRequiredScreen />)
    expect(screen.getByText('Register for early access')).toBeTruthy()
  })

  it('renders the Use a different account button', () => {
    render(<EarlyAccessRequiredScreen />)
    expect(screen.getByText('Use a different account')).toBeTruthy()
  })

  it('calls Linking.openURL with the iskotify.ph early-access URL when register button is pressed', () => {
    const spy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined)
    render(<EarlyAccessRequiredScreen />)
    fireEvent.press(screen.getByText('Register for early access'))
    expect(spy).toHaveBeenCalledWith('https://iskotify.ph/#early-access')
    spy.mockRestore()
  })

  it('signs out and navigates to sign-in when "Use a different account" is pressed', async () => {
    render(<EarlyAccessRequiredScreen />)
    fireEvent.press(screen.getByText('Use a different account'))
    // Allow the async handler to complete
    await screen.findByText('Use a different account')
    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in')
  })
})
