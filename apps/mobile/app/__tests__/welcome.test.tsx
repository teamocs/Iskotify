import React from 'react'
import { render, act } from '@testing-library/react-native'
import WelcomeScreen from '../welcome'

const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null },
}))

let mockSettings: Record<string, unknown>[] = []
let mockFail = false
jest.mock('../../hooks/useDb', () => {
  const db = {
    select: jest.fn(() => ({
      from: jest.fn(() => {
        const chain: Record<string, unknown> = {}
        chain.where = jest.fn(() => chain)
        chain.limit = jest.fn(() => (mockFail ? Promise.reject(new Error('db')) : Promise.resolve(mockSettings)))
        return chain
      }),
    })),
  }
  return { useDb: () => db }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSettings = []
  mockFail = false
})

async function renderWelcome() {
  render(<WelcomeScreen />)
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

/**
 * /welcome was the one-screen summary after onboarding. The paged tour
 * (app/tour.tsx) replaced it; the route stays so an in-flight navigation or an
 * old link still lands somewhere sensible instead of a 404: the tour the first
 * time, Today once the tour has been seen (it never auto-opens twice).
 */
describe('WelcomeScreen', () => {
  it('forwards to the tour, as the post-onboarding step, when the tour has not been seen', async () => {
    mockSettings = [{ id: 1, tourSeenAt: 0 }]
    await renderWelcome()
    expect(mockRedirect).toHaveBeenLastCalledWith('/tour?from=onboarding')
  })

  it('goes to Today when the tour has already been seen', async () => {
    mockSettings = [{ id: 1, tourSeenAt: 1_700_000_000_000 }]
    await renderWelcome()
    expect(mockRedirect).toHaveBeenLastCalledWith('/(tabs)')
    expect(mockRedirect).not.toHaveBeenCalledWith('/tour?from=onboarding')
  })

  it('falls back to the tour when the setting cannot be read', async () => {
    mockFail = true
    await renderWelcome()
    expect(mockRedirect).toHaveBeenLastCalledWith('/tour?from=onboarding')
  })
})
