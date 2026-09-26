import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import EstimatorGradesScreen from '../grades'
import { aria } from '../../../test-utils/aria'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

const mockGetSettings = jest.fn()
const mockUpdateSettings = jest.fn()
jest.mock('../../../services/settings', () => ({
  getSettings: (...a: any[]) => mockGetSettings(...a),
  updateSettings: (...a: any[]) => mockUpdateSettings(...a),
}))
jest.mock('../../../hooks/useDb', () => ({ useDb: () => ({}) }))

// iOS keyboard regression: the form must scroll inside react-native-keyboard-
// controller's KeyboardAwareScrollView (not <Screen>'s plain ScrollView), so
// the focused field is lifted above the keyboard. The stand-in records its
// props and tags itself so a test can tell it apart from a plain ScrollView.
const mockKasProps: Record<string, unknown>[] = []
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react')
  const { ScrollView } = require('react-native')
  return {
    KeyboardAwareScrollView: (p: Record<string, unknown>) => {
      mockKasProps.push(p)
      return React.createElement(ScrollView, { ...p, testID: 'keyboard-aware-scroll' })
    },
  }
})

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
    mockBp.value = 'compact'
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

  // ── Redesign M3 ────────────────────────────────────────────────────────────
  describe('redesign M3', () => {
    it('shows a skeleton, not a bare spinner, while saved grades load', () => {
      mockGetSettings.mockReturnValue(new Promise(() => {}))
      render(<EstimatorGradesScreen />)
      expect(screen.getByLabelText('Loading your grades')).toBeTruthy()
    })

    it('titles the page as an h1 with a named back button', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      expect(screen.getByRole('header', { name: 'Your grades' }).props['aria-level']).toBe(1)
      expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    })

    it('labels every GWA field (the label is the accessible name)', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      for (const g of ['Grade 8 GWA (optional)', 'Grade 9 GWA', 'Grade 10 GWA', 'Grade 11 GWA']) {
        expect(screen.getByLabelText(g)).toBeTruthy()
      }
    })

    it('has exactly one Save action', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      expect(screen.getAllByRole('button', { name: 'Save' }).length).toBe(1)
    })

    it('exposes school type and target campus as radio choices with aria-checked', async () => {
      mockGetSettings.mockResolvedValue({ targetCampus: 'UP Cebu', schoolType: 'private' })
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      expect(aria(screen.getByRole('radio', { name: 'UP Cebu' }), 'aria-checked')).toBe(true)
      expect(aria(screen.getByRole('radio', { name: 'UP Diliman' }), 'aria-checked')).toBe(false)
      expect(aria(screen.getByRole('radio', { name: 'Private' }), 'aria-checked')).toBe(true)
      fireEvent.press(screen.getByRole('radio', { name: 'UP Diliman' }))
      expect(aria(screen.getByRole('radio', { name: 'UP Diliman' }), 'aria-checked')).toBe(true)
    })

    it('gives each campus choice a 44pt target', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      const row = screen.getByRole('radio', { name: 'UP Manila' })
      const style = flattenStyle(typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style)
      expect(style.minHeight as number).toBeGreaterThanOrEqual(44)
    })

    it('uses sentence-case section headings', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      expect(screen.getByRole('header', { name: 'School type' })).toBeTruthy()
      expect(screen.getByRole('header', { name: 'Target campus' })).toBeTruthy()
    })

    it('puts the saved-grades summary beside the form on desktop', async () => {
      mockBp.value = 'expanded'
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      expect(flattenStyle(screen.getByTestId('two-column').props.style).flexDirection).toBe('row')
    })
  })

  describe('keyboard (iOS regression)', () => {
    beforeEach(() => { mockKasProps.length = 0 })

    it('scrolls the form in a KeyboardAwareScrollView with a bottomOffset, not a plain ScrollView', async () => {
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      const kas = screen.getByTestId('keyboard-aware-scroll')
      expect(within(kas).getByLabelText('Grade 11 GWA')).toBeTruthy()
      expect(within(kas).getByRole('button', { name: 'Save' })).toBeTruthy()
      expect(screen.queryByTestId('screen-scroll')).toBeNull()
      const last = mockKasProps[mockKasProps.length - 1]!
      expect(last.bottomOffset as number).toBeGreaterThan(0)
      expect(last.keyboardShouldPersistTaps).toBe('handled')
    })

    it('keeps the two-column desktop layout inside the keyboard-aware scroller', async () => {
      mockBp.value = 'expanded'
      render(<EstimatorGradesScreen />)
      await act(async () => {})
      const kas = screen.getByTestId('keyboard-aware-scroll')
      expect(flattenStyle(within(kas).getByTestId('two-column').props.style).flexDirection).toBe('row')
      expect(within(kas).getByText('Your entries')).toBeTruthy()
    })
  })
})
