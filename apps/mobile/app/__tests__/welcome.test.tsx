import React from 'react'
import { render } from '@testing-library/react-native'
import WelcomeScreen from '../welcome'

const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null },
}))

/**
 * /welcome was the one-screen summary after onboarding. The paged tour
 * (app/tour.tsx) replaced it; the route stays so an in-flight navigation or an
 * old link still lands on the tour instead of a 404.
 */
describe('WelcomeScreen', () => {
  it('forwards to the tour, as the post-onboarding step', () => {
    render(<WelcomeScreen />)
    expect(mockRedirect).toHaveBeenCalledWith('/tour?from=onboarding')
  })
})
