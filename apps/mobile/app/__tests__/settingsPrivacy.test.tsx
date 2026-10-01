/**
 * P1b: Settings → Privacy. Analytics sharing is a plain switch the student
 * controls: off for under-18s until they opt in, on for adults until they opt out.
 */
import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import SettingsScreen from '../settings'
import { aria } from '../../test-utils/aria'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => { require('react').useEffect(cb, [cb]) },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('@lineiconshq/free-icons', () => new Proxy({}, { get: () => ({}) }))
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }))
jest.mock('../../hooks/useDb', () => { const db = { tag: 'db', select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) }; return { useDb: () => db } })
jest.mock('../../hooks/useHomeStats', () => ({ useHomeStats: () => ({ focusedListings: [] }) }))
jest.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    enabled: true, toggle: jest.fn(), dailyReminderHour: 9, weeklySummaryEnabled: true,
    setReminderHour: jest.fn(), toggleWeeklySummary: jest.fn(),
  }),
}))

let mockStored: Record<string, unknown>
jest.mock('../../services/settings', () => ({ getSettings: jest.fn(async () => mockStored) }))
const mockSetOptIn = jest.fn().mockResolvedValue(undefined)
jest.mock('../../services/consent', () => ({ setAnalyticsOptIn: (...a: unknown[]) => mockSetOptIn(...a) }))
const mockApply = jest.fn().mockResolvedValue(true)
jest.mock('../../services/analyticsConsent', () => ({ applyAnalyticsConsent: (...a: unknown[]) => mockApply(...a) }))

const SWITCH = 'Share anonymous usage analytics'
const isOn = () => screen.getByRole('switch', { name: SWITCH }).props.value

beforeEach(() => {
  jest.clearAllMocks()
  mockStored = { ageBand: 'adult', consentedAt: 5, analyticsOptIn: null }
})

describe('Settings → Privacy', () => {
  it('has a Privacy group with the analytics switch and what it shares', async () => {
    render(<SettingsScreen />)
    const h = screen.getByRole('header', { name: 'Privacy' })
    expect(aria(h, 'aria-level')).toBe(2)
    expect(await screen.findByRole('switch', { name: SWITCH })).toBeTruthy()
    expect(screen.getByText(/No names or emails/)).toBeTruthy()
  })

  it('is ON for an adult who never chose (they can switch it off)', async () => {
    render(<SettingsScreen />)
    await waitFor(() => expect(isOn()).toBe(true))
  })

  it('is OFF for an under-18 who never chose', async () => {
    mockStored = { ageBand: 'minor', consentedAt: 5, guardianConsentAt: 5, analyticsOptIn: null }
    render(<SettingsScreen />)
    await act(async () => {})
    expect(isOn()).toBe(false)
  })

  it('shows an explicit choice either way', async () => {
    mockStored = { ageBand: 'adult', consentedAt: 5, analyticsOptIn: 0 }
    render(<SettingsScreen />)
    await act(async () => {})
    expect(isOn()).toBe(false)
  })

  it('switching it off is saved and applied straight away', async () => {
    render(<SettingsScreen />)
    await waitFor(() => expect(isOn()).toBe(true))
    await act(async () => { fireEvent(screen.getByRole('switch', { name: SWITCH }), 'valueChange', false) })
    expect(mockSetOptIn).toHaveBeenCalledWith(expect.anything(), false)
    expect(mockApply).toHaveBeenCalled()
    expect(isOn()).toBe(false)
  })

  it('an under-18 can opt in', async () => {
    mockStored = { ageBand: 'minor', consentedAt: 5, guardianConsentAt: 5, analyticsOptIn: null }
    render(<SettingsScreen />)
    await act(async () => {})
    await act(async () => { fireEvent(screen.getByRole('switch', { name: SWITCH }), 'valueChange', true) })
    expect(mockSetOptIn).toHaveBeenCalledWith(expect.anything(), true)
    expect(isOn()).toBe(true)
  })

  it('cannot be switched until the saved choice has loaded (no flicker, no wrong rollback)', async () => {
    let resolve: (v: unknown) => void = () => {}
    const { getSettings } = jest.requireMock('../../services/settings') as { getSettings: jest.Mock }
    getSettings.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    render(<SettingsScreen />)
    expect(screen.getByRole('switch', { name: SWITCH }).props.disabled).toBe(true)
    await act(async () => { resolve(mockStored) })
    expect(screen.getByRole('switch', { name: SWITCH }).props.disabled).toBeFalsy()
    expect(isOn()).toBe(true)
  })

  it('goes back to the saved value if the choice could not be saved', async () => {
    mockSetOptIn.mockRejectedValueOnce(new Error('disk full'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    render(<SettingsScreen />)
    await waitFor(() => expect(isOn()).toBe(true))
    await act(async () => { fireEvent(screen.getByRole('switch', { name: SWITCH }), 'valueChange', false) })
    expect(isOn()).toBe(true)
  })

  it('links to where grades and family details are managed or withdrawn', async () => {
    const { router } = require('expo-router')
    render(<SettingsScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Grades and family details' }))
    expect(router.push).toHaveBeenCalledWith('/profile/scholarship-info')
  })
})
