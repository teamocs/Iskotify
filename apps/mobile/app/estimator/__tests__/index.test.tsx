import React from 'react'
import { render, screen, act } from '@testing-library/react-native'
import EstimatorScreen from '../index'

// ── expo-router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn((cb: () => (() => void) | void) => {
    cb()
  }),
}))

// ── safe-area ────────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// ── supabase ─────────────────────────────────────────────────────────────────
const mockRpc = jest.fn()
jest.mock('../../../services/supabase', () => ({
  supabase: { rpc: (...args: any[]) => mockRpc(...args) },
}))

// ── settings ─────────────────────────────────────────────────────────────────
const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock('../../../services/settings', () => ({
  getSettings: (...args: any[]) => mockGetSettings(...args),
  updateSettings: (...args: any[]) => mockUpdateSettings(...args),
}))

// ── useDb ────────────────────────────────────────────────────────────────────
const mockSelect = jest.fn()
jest.mock('../../../hooks/useDb', () => ({
  useDb: () => ({
    select: () => mockSelect(),
  }),
}))

// ── disclaimer components ─────────────────────────────────────────────────────
jest.mock('../../../components/estimator/ScoreDisclaimerModal', () => ({
  ScoreDisclaimerModal: ({ visible }: any) =>
    visible ? null : null,
  ScoreDisclaimerNotice: () => {
    const { Text } = require('react-native')
    return <Text>Unofficial estimate — verify at upcat.up.edu.ph</Text>
  },
}))

// ── sample data ───────────────────────────────────────────────────────────────

const SAMPLE_SETTINGS = {
  hsGwaG8: 90,
  hsGwaG9: 91,
  hsGwaG10: 92,
  hsGwaG11: 93,
  schoolType: 'public_general',
  isIndigenous: false,
  targetCampus: 'UP Diliman',
  province: 'Metro Manila',
  scoreDisclaimerAck: true,
}

const SAMPLE_RPC_RESULT = {
  point: 2.25,
  low: 2.00,
  high: 2.50,
  eeas: { palugit: 0, pabigat: 0 },
  campuses: [
    {
      campus: 'UP Diliman',
      cutoff: 2.10,
      isEstimate: true,
      year: 2025,
      status: 'Possible',
      gap: 0.15,
    },
    {
      campus: 'UP Los Baños',
      cutoff: 2.50,
      isEstimate: false,
      year: null,
      status: 'Likely',
      gap: -0.25,
    },
  ],
}

describe('EstimatorScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockGetSettings.mockResolvedValue(SAMPLE_SETTINGS)

    // Mock local session query: select().from(practiceSessions) → []
    mockSelect.mockReturnValue({
      from: jest.fn().mockResolvedValue([]),
    })

    mockRpc.mockResolvedValue({ data: SAMPLE_RPC_RESULT, error: null })
  })

  it('renders the screen title', async () => {
    render(<EstimatorScreen />)
    // Header title is rendered immediately before async load completes
    expect(screen.getByText('Admission Score Estimator')).toBeTruthy()
  })

  it('shows the range bar with point estimate after RPC resolves', async () => {
    render(<EstimatorScreen />)
    // findByText waits for async state updates
    expect(await screen.findByText(/2\.25/)).toBeTruthy()
    expect(await screen.findByText(/range 2\.00–2\.50/)).toBeTruthy()
  })

  it('renders per-campus rows', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText('UP Diliman')).toBeTruthy()
    expect(await screen.findByText('UP Los Baños')).toBeTruthy()
  })

  it('renders Possible status badge for UP Diliman', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText('Possible')).toBeTruthy()
  })

  it('renders Likely status badge for UP Los Baños', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText('Likely')).toBeTruthy()
  })

  it('shows palugit not eligible when palugit=0', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Palugit: not eligible/)).toBeTruthy()
  })

  it('shows pabigat not applicable when pabigat=0', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Pabigat: not applicable/)).toBeTruthy()
  })

  it('renders edit grades link', async () => {
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Edit grades/)).toBeTruthy()
  })

  it('shows empty state when no grades are set', async () => {
    mockGetSettings.mockResolvedValue({
      ...SAMPLE_SETTINGS,
      hsGwaG8: null,
      hsGwaG9: null,
      hsGwaG10: null,
      hsGwaG11: null,
    })
    render(<EstimatorScreen />)
    expect(await screen.findByText('No grades yet')).toBeTruthy()
    expect(await screen.findByText(/Add your Grade 8–11 GWA/)).toBeTruthy()
  })

  it('shows offline error state when RPC fails', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'Network error' } })
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy()
    expect(await screen.findByText('Retry')).toBeTruthy()
  })

  it('shows EEAS palugit chip when palugit > 0', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...SAMPLE_RPC_RESULT,
        eeas: { palugit: 1, pabigat: 0 },
      },
      error: null,
    })
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Palugit: −0\.05 applied/)).toBeTruthy()
  })

  it('shows EEAS pabigat chip when pabigat > 0', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...SAMPLE_RPC_RESULT,
        eeas: { palugit: 0, pabigat: 1 },
      },
      error: null,
    })
    render(<EstimatorScreen />)
    expect(await screen.findByText(/Pabigat: \+0\.05/)).toBeTruthy()
  })

  it('passes correct payload to RPC', async () => {
    render(<EstimatorScreen />)
    await screen.findByText(/2\.25/)
    expect(mockRpc).toHaveBeenCalledWith('estimate_admission_score', {
      payload: expect.objectContaining({
        hsGWA: expect.any(Number),
      }),
    })
  })
})
