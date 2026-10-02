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
// The web glimpse (P4): whether this is a signed-out web visitor.
let mockGuest = false
jest.mock('../../../services/guestSession', () => ({ isSignedOutWebGuest: async () => mockGuest }))

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
  mockGuest = false
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

// The web glimpse (P4). A signed-out web visitor trying the free diagnostic has
// agreed to nothing stored on this device. This browser may still hold another
// person's settings (an account that signed out): the guest is never treated as
// that returning user, never sent to re-consent, and analytics stays off.
describe('ConsentGate — guest preview', () => {
  it.each(['/try', '/practice/diagnostic', '/practice/diagnostic/'])(
    'lets a signed-out guest use %s without consent, with analytics off', async (p) => {
      mockPath = p
      mockGuest = true
      mockSettings = { ...ONBOARDED, ageBand: '', consentVersion: '', consentedAt: 0, guardianConsentAt: 0 }
      renderGate()
      await waitFor(() => expect(covered()).toBe(false))
      await new Promise(r => setTimeout(r, 0))
      expect(mockReplace).not.toHaveBeenCalled()
      expect(mockSetAnalytics).toHaveBeenCalledWith(false)
      expect(mockSetAnalytics).not.toHaveBeenCalledWith(true)
    },
  )

  it('never switches analytics on for a guest, even when the device holds a consenting account', async () => {
    mockPath = '/practice/diagnostic'
    mockGuest = true
    mockSettings = CURRENT
    renderGate()
    await waitFor(() => expect(covered()).toBe(false))
    expect(mockSetAnalytics).toHaveBeenCalledWith(false)
    expect(mockSetAnalytics).not.toHaveBeenCalledWith(true)
  })

  it('still gates the diagnostic for a signed-in student', async () => {
    mockPath = '/practice/diagnostic'
    mockGuest = false
    mockSettings = { ...CURRENT, consentedAt: 0 }
    renderGate()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consent'))
  })

  it('does not exempt any other route for a guest', async () => {
    mockPath = '/practice/upcat/all'
    mockGuest = true
    mockSettings = { ...CURRENT, consentedAt: 0 }
    renderGate()
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/consent'))
  })

  // Security hardening: a signed-out web visitor has agreed to nothing on ANY
  // route; a consenting account's stored choice on this browser is never applied.
  it.each(['/', '/practice/upcat/all', '/settings'])(
    'never applies stored consent for a signed-out web visitor on %s', async (p) => {
      mockPath = p
      mockGuest = true
      mockSettings = CURRENT
      renderGate()
      await waitFor(() => expect(mockSetAnalytics).toHaveBeenCalledWith(false), { timeout: 10_000 })
      expect(mockSetAnalytics).not.toHaveBeenCalledWith(true)
    },
  )

  it.each(['/landing', '/auth/sign-in', '/terms'])(
    'turns analytics off for a signed-out web visitor on the exempt route %s too', async (p) => {
      mockPath = p
      mockGuest = true
      mockSettings = CURRENT
      renderGate()
      await waitFor(() => expect(mockSetAnalytics).toHaveBeenCalledWith(false), { timeout: 10_000 })
      expect(mockSetAnalytics).not.toHaveBeenCalledWith(true)
      expect(covered()).toBe(false)
    },
  )

  it('keeps the guest routes out of the static exemption list (it depends on being signed out)', () => {
    expect(isConsentExemptPath('/try')).toBe(false)
    expect(isConsentExemptPath('/practice/diagnostic')).toBe(false)
  })
})
