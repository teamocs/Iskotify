/**
 * P1b: income and GWA are sensitive personal information, so the Scholarship
 * profile only asks for them after a separate opt-in, and lets the student
 * withdraw that consent (clearing the details) at any time.
 */
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import ScholarshipInfoScreen from '../scholarship-info'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), canGoBack: () => true } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native')
  return { KeyboardAwareScrollView: ScrollView }
})
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../hooks/useDb', () => { const db = { tag: 'db' }; return { useDb: () => db } })
jest.mock('../../../services/sync', () => ({ pushUserData: jest.fn().mockResolvedValue(undefined) }))

let mockStored: Record<string, unknown>
const mockUpdate = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn(async () => mockStored),
  updateSettings: (...a: unknown[]) => mockUpdate(...a),
}))
const mockGrant = jest.fn().mockResolvedValue(undefined)
const mockWithdraw = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/consent', () => ({
  grantSensitiveConsent: (...a: unknown[]) => mockGrant(...a),
  withdrawSensitiveConsent: (...a: unknown[]) => mockWithdraw(...a),
}))
const mockConfirm = jest.fn()
jest.mock('../../../utils/confirmAction', () => ({ confirmAction: (...a: unknown[]) => mockConfirm(...a) }))

const LABEL = 'Use my grades and family details to match scholarships and estimate my admission score'
const WITHDRAW = 'Withdraw consent and clear these details'

async function open() {
  render(<ScholarshipInfoScreen />)
  await act(async () => {})
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStored = { incomeBracket: '100k-300k', gwa: 90, province: 'Albay', sensitiveConsentAt: 0 }
})

describe('Scholarship profile without consent', () => {
  it('shows the opt-in switch (OFF) instead of the income and GWA fields, and still lets the student pick a province', async () => {
    await open()
    expect(screen.getByRole('switch', { name: LABEL }).props.value).toBe(false)
    expect(screen.queryByText('Household income bracket')).toBeNull()
    expect(screen.queryByLabelText('GWA (General Weighted Average)')).toBeNull()
    expect(screen.getAllByLabelText('Province').length).toBeGreaterThan(0)
  })

  it('does not write income or GWA when saving (province only)', async () => {
    await open()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })) })
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const patch = mockUpdate.mock.calls[0]![1] as Record<string, unknown>
    expect(Object.keys(patch)).toEqual(['province'])
  })

  it('switching it on records the consent and reveals the fields, with the stored values', async () => {
    await open()
    await act(async () => { fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', true) })
    expect(mockGrant).toHaveBeenCalledWith({ tag: 'db' })
    expect(screen.getByText('Household income bracket')).toBeTruthy()
    expect(screen.getByLabelText('GWA (General Weighted Average)').props.value).toBe('90')
  })

  it('offers to clear details that were saved before consent existed', async () => {
    await open()
    expect(screen.getByRole('button', { name: WITHDRAW })).toBeTruthy()
  })

  it('offers nothing to withdraw when nothing sensitive is stored', async () => {
    mockStored = { incomeBracket: null, gwa: null, province: null, sensitiveConsentAt: 0 }
    await open()
    expect(screen.queryByRole('button', { name: WITHDRAW })).toBeNull()
  })
})

describe('Scholarship profile with consent', () => {
  beforeEach(() => { mockStored = { ...mockStored, sensitiveConsentAt: 1_700_000_000_000 } })

  it('shows the income and GWA fields and saves them with the province', async () => {
    await open()
    expect(screen.getByText('Household income bracket')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })) })
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ incomeBracket: '100k-300k', gwa: 90, province: 'Albay' })
  })

  it('withdraws only after a confirmation, then clears the screen and shows the switch OFF', async () => {
    await open()
    fireEvent.press(screen.getByRole('button', { name: WITHDRAW }))
    expect(mockConfirm).toHaveBeenCalledTimes(1)
    expect(mockWithdraw).not.toHaveBeenCalled()
    await act(async () => { await mockConfirm.mock.calls[0]![3]() })
    expect(mockWithdraw).toHaveBeenCalledWith({ tag: 'db' })
    expect(screen.getByRole('switch', { name: LABEL }).props.value).toBe(false)
    expect(screen.queryByLabelText('GWA (General Weighted Average)')).toBeNull()
    expect(screen.queryByRole('button', { name: WITHDRAW })).toBeNull()
  })
})
