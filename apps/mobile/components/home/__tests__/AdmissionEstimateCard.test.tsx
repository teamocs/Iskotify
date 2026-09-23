import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { AdmissionEstimateCard } from '../AdmissionEstimateCard'
import { useAdmissionEstimate } from '../../../hooks/useAdmissionEstimate'

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('../../../hooks/useAdmissionEstimate')
const mockUseAdmissionEstimate = useAdmissionEstimate as jest.Mock

function mockState(overrides: Partial<ReturnType<typeof useAdmissionEstimate>>) {
  mockUseAdmissionEstimate.mockReturnValue({
    status: 'loading',
    readiness: null,
    result: null,
    acknowledgeDisclaimer: jest.fn(),
    reload: jest.fn(),
    ...overrides,
  })
}

describe('AdmissionEstimateCard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows "Add your grades" when there are no grades yet', () => {
    mockState({ status: 'no-grades' })
    render(<AdmissionEstimateCard />)
    expect(screen.getByText('Add your grades')).toBeTruthy()
  })

  it('shows how many more questions are needed when not ready', () => {
    mockState({
      status: 'not-ready',
      readiness: {
        math: { percent: null, answered: 5, needed: 15 },
        reading: { percent: null, answered: 0, needed: 20 },
        language: { percent: 80, answered: 20, needed: 0 },
        science: { percent: null, answered: 12, needed: 8 },
        ready: false,
      } as any,
    })
    render(<AdmissionEstimateCard />)
    expect(screen.getByText('Practice 43 more questions to unlock')).toBeTruthy()
  })

  it('shows the low–high range when ready', () => {
    mockState({
      status: 'ready',
      result: { point: 2.35, low: 2.15, high: 2.55, eeas: { palugit: 0, pabigat: 0, eligiblePalugit: false }, campuses: [] } as any,
    })
    render(<AdmissionEstimateCard />)
    expect(screen.getByText('2.15–2.55')).toBeTruthy()
  })

  it('always shows the card title', () => {
    mockState({ status: 'ready', result: { point: 2, low: 1.8, high: 2.2 } as any })
    render(<AdmissionEstimateCard />)
    expect(screen.getByText('Estimated Admission Score')).toBeTruthy()
  })

  it('navigates to /estimator when tapped', () => {
    mockState({ status: 'no-grades' })
    render(<AdmissionEstimateCard />)
    fireEvent.press(screen.getByRole('button', { name: /estimated admission score/i }))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/estimator')
  })
})
