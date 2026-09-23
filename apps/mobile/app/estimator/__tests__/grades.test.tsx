import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import EstimatorGradesScreen from '../grades'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock('../../../services/settings', () => ({
  getSettings: (...a: any[]) => mockGetSettings(...a),
  updateSettings: (...a: any[]) => mockUpdateSettings(...a),
}))
jest.mock('../../../hooks/useDb', () => ({ useDb: () => ({}) }))

/** Flattens an RN style prop (array of objects/falsy) into one plain object. */
function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) {
    return style.reduce((acc: Record<string, unknown>, s) => ({ ...acc, ...flattenStyle(s) }), {})
  }
  return (style ?? {}) as Record<string, unknown>
}

describe('EstimatorGradesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetSettings.mockResolvedValue({})
    mockUpdateSettings.mockResolvedValue(undefined)
  })

  // ── Finding 3: a11y touch target ──────────────────────────────────────────
  it('gives each school-type chip a touch target at least 44pt tall (DESIGN.md floor)', async () => {
    render(<EstimatorGradesScreen />)
    await act(async () => {})
    const chip = screen.getByTestId('school-type-chip-public_general')
    const style = flattenStyle(chip.props.style)
    expect(style.minHeight as number).toBeGreaterThanOrEqual(44)
  })

  // ── Finding 5: non-blocking failing-grade warning ─────────────────────────
  it('shows a non-blocking warning when a grade is below 60, but still allows saving', async () => {
    render(<EstimatorGradesScreen />)
    await act(async () => {})

    fireEvent.changeText(screen.getByPlaceholderText('e.g. 90.0'), '45')
    expect(await screen.findByText(/Below 60 is a failing grade in DepEd/i)).toBeTruthy()

    // Not a blocking error — Save must still go through.
    await act(async () => {
      fireEvent.press(screen.getAllByText('Save')[0]!)
    })
    expect(mockUpdateSettings).toHaveBeenCalled()
  })

  it('does not show the failing-grade warning for a passing grade', async () => {
    render(<EstimatorGradesScreen />)
    await act(async () => {})
    fireEvent.changeText(screen.getByPlaceholderText('e.g. 90.0'), '75')
    expect(screen.queryByText(/Below 60 is a failing grade/i)).toBeNull()
  })

  it('does not show the failing-grade warning for an empty (optional) field', async () => {
    render(<EstimatorGradesScreen />)
    await act(async () => {})
    expect(screen.queryByText(/Below 60 is a failing grade/i)).toBeNull()
  })
})
