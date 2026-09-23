import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import EstimatorScreen from '../index'
import { useAdmissionEstimate } from '../../../hooks/useAdmissionEstimate'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../hooks/useAdmissionEstimate')
const mockUseAdmissionEstimate = useAdmissionEstimate as jest.Mock

jest.mock('../../../components/estimator/ScoreDisclaimerModal', () => ({
  ScoreDisclaimerModal: ({ visible }: any) => {
    const { Text } = require('react-native')
    return visible ? <Text>Score Estimate Disclaimer</Text> : null
  },
  ScoreDisclaimerNotice: () => {
    const { Text } = require('react-native')
    return <Text>Unofficial estimate — verify at upcat.up.edu.ph</Text>
  },
}))

const READY_RESULT = {
  point: 2.352,
  low: 2.152,
  high: 2.552,
  eeas: { palugit: 0.05, pabigat: 0, eligiblePalugit: true },
  campuses: [
    { campus: 'UP Diliman', program: 'BS Computer Science', cutoff: 1.55, year: 2025, isEstimate: false, status: 'Unlikely', gap: 0.8 },
    { campus: 'UP Diliman', program: null, cutoff: 2.174, year: 2019, isEstimate: true, status: 'Possible', gap: 0.178 },
    { campus: 'UP Baguio', program: null, cutoff: 2.6, year: 2019, isEstimate: true, status: 'Likely', gap: -0.25 },
  ],
}

const READY_READINESS = {
  math: { percent: 65, answered: 30, needed: 0 },
  reading: { percent: 70, answered: 25, needed: 0 },
  language: { percent: 72, answered: 22, needed: 0 },
  science: { percent: 60, answered: 20, needed: 0 },
  ready: true,
}

const NOT_READY_READINESS = {
  math: { percent: null, answered: 5, needed: 15 },
  reading: { percent: null, answered: 0, needed: 20 },
  language: { percent: 80, answered: 20, needed: 0 },
  science: { percent: null, answered: 12, needed: 8 },
  ready: false,
}

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

describe('EstimatorScreen', () => {
  beforeEach(() => jest.clearAllMocks())

  it('renders the screen title', () => {
    mockState({ status: 'loading' })
    render(<EstimatorScreen />)
    expect(screen.getByText(/Admission Score Estimator/i)).toBeTruthy()
  })

  it('shows the disclaimer modal when not yet acknowledged', () => {
    mockState({ status: 'disclaimer' })
    render(<EstimatorScreen />)
    expect(screen.getByText('Score Estimate Disclaimer')).toBeTruthy()
  })

  it('prompts to add grades when there are no grades yet', () => {
    mockState({ status: 'no-grades' })
    render(<EstimatorScreen />)
    expect(screen.getByText(/No grades yet/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: /add your grades/i })).toBeTruthy()
  })

  it('shows a practice-to-unlock card per subtest when not ready, with a link into each drill', () => {
    mockState({ status: 'not-ready', readiness: NOT_READY_READINESS as any })
    render(<EstimatorScreen />)
    expect(screen.getByText(/Practice to unlock/i)).toBeTruthy()
    expect(screen.getByText(/Science: 12 of 20 questions/i)).toBeTruthy()
    expect(screen.getByText(/Mathematics: 5 of 20 questions/i)).toBeTruthy()
    // Language is already ready — should not show a "needed" row for it.
    expect(screen.queryByText(/Language Proficiency: 20 of 20/i)).toBeNull()
  })

  it('shows the low–high range with the point estimate marked when ready, saying lower is better', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByText(/2\.35/)).toBeTruthy()
    expect(screen.getByText(/2\.15/)).toBeTruthy()
    expect(screen.getByText(/2\.55/)).toBeTruthy()
    expect(screen.getByText(/lower is better/i)).toBeTruthy()
  })

  it('shows the four subtest percentages when ready', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByText(/65%/)).toBeTruthy()
    expect(screen.getByText(/70%/)).toBeTruthy()
    expect(screen.getByText(/72%/)).toBeTruthy()
    expect(screen.getByText(/60%/)).toBeTruthy()
  })

  it('shows the EEAS adjustment line when a palugit or pabigat applies', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByText(/palugit/i)).toBeTruthy()
  })

  it('groups campuses by Likely / Possible / Unlikely, shows cutoff + year, program name, and marks estimates', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByText('Likely')).toBeTruthy()
    expect(screen.getByText('Possible')).toBeTruthy()
    expect(screen.getByText('Unlikely')).toBeTruthy()
    expect(screen.getByText(/BS Computer Science/)).toBeTruthy()
    expect(screen.getAllByText(/2019/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/estimate/i).length).toBeGreaterThan(0)
  })

  it('gives each campus row an accessibility label combining campus/program, status, cutoff, year and "estimate"', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByLabelText('UP Diliman – BS Computer Science, Unlikely, cutoff 1.55 (2025)')).toBeTruthy()
    expect(screen.getByLabelText('UP Diliman, Possible, cutoff 2.17 (2019), estimate')).toBeTruthy()
    expect(screen.getByLabelText('UP Baguio, Likely, cutoff 2.60 (2019), estimate')).toBeTruthy()
  })

  it('keeps the inline disclaimer notice visible in every non-modal state', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    expect(screen.getByText(/Unofficial estimate/)).toBeTruthy()
  })

  it('links to /estimator/grades to add or edit grades', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    render(<EstimatorScreen />)
    fireEvent.press(screen.getByText(/Edit grades/i))
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/estimator/grades')
  })
})
