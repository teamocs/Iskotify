/**
 * The root consent gate. Every route except the pre-consent ones (consent,
 * onboarding, landing, sign-in and the auth callbacks, the legal pages) is only
 * for a student whose consent covers the current Terms and Privacy Policy. An
 * onboarded student without it is sent to the update screen, whatever route a
 * deep link opened, and nothing of that route shows while the check runs. A
 * student who has not finished onboarding is left to onboarding. A settings read
 * that fails never locks the student out.
 */
import React from 'react'
import { Text } from 'react-native'
import { render, screen, waitFor } from '@testing-library/react-native'
import { ConsentGate } from '../ConsentGate'
import { ThemeProvider } from '../../../theme/ThemeContext'
import { isConsentExemptPath } from '../../../utils/consent'

let mockPath = '/'
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
}))

let mockFocusRows: unknown[] = []
jest.mock('../../../hooks/useDb', () => {
  const db = { select: () => ({ from: () => ({ limit: async () => mockFocusRows }) }) }
  return { useDb: () => db }
})

let mockSettings: Record<string, unknown> | Error
jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn(async () => { if (mockSettings instanceof Error) throw mockSettings; return mockSettings }),
}))
const mockSetAnalytics = jest.fn()
jest.mock('../../../lib/analytics', () => ({ setAnalyticsConsent: (on: boolean) => mockSetAnalytics(on) }))

const ONBOARDED = { fullName: 'Juan', selectedListingSlug: 'upcat', targetExams: '[]' }
const CURRENT = { ...ONBOARDED, ageBand: 'adult', consentVersion: '2026-10-01', consentedAt: 5, guardianConsentAt: 0 }

function renderGate(enabled = true) {
  return render(
    <ThemeProvider><ConsentGate enabled={enabled}><Text testID="app">the app</Text></ConsentGate></ThemeProvider>,
  )
}
const covered = () => screen.queryByTestId('consent-gate-cover') !== null

beforeEach(() => {
  mockPath = '/'
  mockFocusRows = []
  mockReplace.mockClear()
  mockSetAnalytics.mockClear()
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => jest.restoreAllMocks())

describe('isConsentExemptPath', () => {
  it.each(['/consent', '/onboarding', '/landing', '/auth/sign-in', '/auth/callback', '/auth/reset-password', '/terms', '/privacy', '/terms/'])(
    '%s is reachable without consent', (p) => expect(isConsentExemptPath(p)).toBe(true),
  )
  it.each(['/', '/practice', '/listings/upcat', '/notes', '/settings', '/profile/scholarship-info', '/estimator/grades', '/tour', '/authx'])(
    '%s needs consent', (p) => expect(isConsentExemptPath(p)).toBe(false),
  )
})

describe('ConsentGate', () => {
  it('lets a student with current consent in, after covering the route while it checks', async () => {
    mockSettings = CURRENT
    renderGate()
    expect(covered()).toBe(true)
    await waitFor(() => expect(covered()).toBe(false))
    expect(screen.getByTestId('app')).toBeTruthy()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it.each([
    ['an existing user with no consent recorded', { ...ONBOARDED, ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 }],
    ['an older version', { ...CURRENT, consentVersion: '2025-06-01' }],
    ['a minor without a guardian attestation', { ...CURRENT, ageBand: 'minor', guardianConsentAt: 0 }],
  ])('sends %s to the update screen and never shows the route', async (_name, row) => {
    mockSettings = row
    renderGate()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consent'))
    expect(covered()).toBe(true)
  })

  it('also guards deep links outside the tabs', async () => {
    mockPath = '/listings/upcat'
    mockSettings = { ...CURRENT, consentedAt: 0 }
    renderGate()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consent'))
    expect(covered()).toBe(true)
  })

  it('leaves the pre-consent routes alone, with no cover', async () => {
    mockPath = '/terms'
    mockSettings = { ...CURRENT, consentedAt: 0 }
    renderGate()
    expect(covered()).toBe(false)
    await new Promise(r => setTimeout(r, 0))
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('leaves a student who has not finished onboarding to onboarding', async () => {
    mockSettings = { fullName: '', selectedListingSlug: '', targetExams: '[]', ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 }
    renderGate()
    await waitFor(() => expect(covered()).toBe(false))
    mockSettings = { ...mockSettings, fullName: 'Juan' } // named, no exam chosen yet
    renderGate()
    await waitFor(() => expect(covered()).toBe(false))
    await new Promise(r => setTimeout(r, 0))
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('counts a saved focus listing as a finished onboarding', async () => {
    mockFocusRows = [{ listingSlug: 'upcat' }]
    mockSettings = { ...ONBOARDED, selectedListingSlug: '', ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 }
    renderGate()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consent'))
  })

  it('applies the stored analytics choice in both branches', async () => {
    mockSettings = { ...CURRENT, analyticsOptIn: 0 }
    renderGate()
    await waitFor(() => expect(mockSetAnalytics).toHaveBeenCalledWith(false))
    mockSetAnalytics.mockClear()
    mockSettings = CURRENT
    renderGate()
    await waitFor(() => expect(mockSetAnalytics).toHaveBeenCalledWith(true))
    mockSetAnalytics.mockClear()
    mockSettings = { ...ONBOARDED, ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 }
    renderGate()
    await waitFor(() => expect(mockSetAnalytics).toHaveBeenCalledWith(false))
  })

  it('does nothing until the app has finished its launch routing', async () => {
    mockSettings = { ...CURRENT, consentedAt: 0 }
    renderGate(false)
    await new Promise(r => setTimeout(r, 0))
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByTestId('app')).toBeTruthy()
  })

  it('never locks the student out when the settings cannot be read (and keeps analytics off)', async () => {
    mockSettings = new Error('db down')
    renderGate()
    await waitFor(() => expect(covered()).toBe(false))
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.getByTestId('app')).toBeTruthy()
    expect(mockSetAnalytics).toHaveBeenCalledWith(false)
  })
})
