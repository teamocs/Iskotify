/**
 * P1b: Grade 8-11 grades and Indigenous Peoples status are sensitive personal
 * information. The estimator's grades screen asks for them only after a
 * separate opt-in, and lets the student withdraw that consent (clearing them).
 */
import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import EstimatorGradesScreen from '../grades'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('react-native-keyboard-controller', () => {
  const { ScrollView } = require('react-native')
  return { KeyboardAwareScrollView: ScrollView }
})
jest.mock('../../../hooks/useDb', () => { const db = { tag: 'db' }; return { useDb: () => db } })

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
  render(<EstimatorGradesScreen />)
  await act(async () => {})
}

beforeEach(() => {
  jest.clearAllMocks()
  mockStored = { hsGwaG9: 91, isIndigenous: true, schoolType: 'private', targetCampus: 'UP Cebu', sensitiveConsentAt: 0 }
})

describe('Estimator grades without consent', () => {
  it('shows the opt-in switch (OFF) instead of the grade fields and the Indigenous toggle, keeps school type and campus', async () => {
    await open()
    expect(screen.getByRole('switch', { name: LABEL }).props.value).toBe(false)
    expect(screen.queryByPlaceholderText('e.g. 90.0')).toBeNull()
    expect(screen.queryByText('Indigenous Peoples')).toBeNull()
    expect(screen.getByText('School type')).toBeTruthy()
    expect(screen.getByText('Target campus')).toBeTruthy()
  })

  it('saves only school type and campus: never grades or Indigenous status', async () => {
    await open()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })) })
    const patch = mockUpdate.mock.calls[0]![1] as Record<string, unknown>
    expect(Object.keys(patch).sort()).toEqual(['schoolType', 'targetCampus'])
  })

  it('switching it on records the consent and reveals the grade fields', async () => {
    await open()
    await act(async () => { fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', true) })
    expect(mockGrant).toHaveBeenCalledWith({ tag: 'db' })
    expect(screen.getByPlaceholderText('e.g. 90.0').props.value).toBe('91')
    expect(screen.getByText('Indigenous Peoples')).toBeTruthy()
  })

  it('says so when the consent could not be saved, and keeps the fields hidden', async () => {
    mockGrant.mockRejectedValueOnce(new Error('disk full'))
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    await open()
    await act(async () => { fireEvent(screen.getByRole('switch', { name: LABEL }), 'valueChange', true) })
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn.t save your choice/)
    expect(screen.queryByText('Indigenous Peoples')).toBeNull()
  })
})

describe('Estimator grades with consent', () => {
  beforeEach(() => { mockStored = { ...mockStored, sensitiveConsentAt: 1_700_000_000_000 } })

  it('saves grades and Indigenous status as before', async () => {
    await open()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Save' })) })
    expect(mockUpdate.mock.calls[0]![1]).toMatchObject({ hsGwaG9: 91, isIndigenous: true, schoolType: 'private' })
  })

  it('can withdraw (after a confirmation), which clears the fields and shows the switch OFF', async () => {
    await open()
    fireEvent.press(screen.getByRole('button', { name: WITHDRAW }))
    expect(mockWithdraw).not.toHaveBeenCalled()
    await act(async () => { await mockConfirm.mock.calls[0]![3]() })
    expect(mockWithdraw).toHaveBeenCalledWith({ tag: 'db' })
    expect(screen.getByRole('switch', { name: LABEL }).props.value).toBe(false)
    expect(screen.queryByPlaceholderText('e.g. 90.0')).toBeNull()
  })
});
