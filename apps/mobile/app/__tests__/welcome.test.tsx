import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import WelcomeScreen from '../welcome'

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

beforeEach(() => jest.clearAllMocks())

/**
 * Welcome (redesign M2): one calm screen after onboarding instead of a
 * four-slide carousel. It maps the four real destinations and ends in the one
 * next step. No swiping pager, so nothing to miss and nothing that animates.
 */
describe('WelcomeScreen', () => {
  it('greets the student with the approved tagline', () => {
    render(<WelcomeScreen />)
    expect(screen.getByRole('header', { name: /You're all set/ })).toBeTruthy()
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
  })

  it('maps the four real destinations: Today, Practice, Explore, Progress', () => {
    render(<WelcomeScreen />)
    for (const name of ['Today', 'Practice', 'Explore', 'Progress']) {
      expect(screen.getByRole('header', { name })).toBeTruthy()
    }
    expect(screen.queryByText(/\bLists\b|\bUpdates\b|Home — your dashboard/)).toBeNull()
  })

  it('ends in one primary action that enters the app on Today', () => {
    const { router } = require('expo-router')
    render(<WelcomeScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Start studying' }))
    expect(router.replace).toHaveBeenCalledWith('/(tabs)')
  })
})
