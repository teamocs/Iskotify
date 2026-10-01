/**
 * StepShell on wide windows: the question sits in a card with its Continue
 * inside it (not a full-bleed bar at the bottom of a 1440px window), beside a
 * rail that names the four sections and marks where the student is.
 */
import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { StepShell } from '../StepShell'
import { aria } from '../../../test-utils/aria'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

function renderStep(step: 'grade' | 'courses' | 'province' = 'courses', extra: Partial<React.ComponentProps<typeof StepShell>> = {}) {
  render(
    <StepShell step={step} title="Which courses are you considering?" primaryLabel="Continue" onPrimary={() => {}} {...extra}>
      <Text>answers</Text>
    </StepShell>,
  )
}

describe('StepShell', () => {
  it('phones: no section rail', () => {
    mockBp = 'compact'
    renderStep()
    expect(screen.queryByTestId('section-rail')).toBeNull()
    expect(screen.getByText('Step 6 of 11')).toBeTruthy()
  })

  it('does not count the skipped income and GWA steps once the sensitive opt-in is declined', () => {
    mockBp = 'compact'
    renderStep('province', { sensitive: false })
    expect(screen.getByText('Step 8 of 9')).toBeTruthy()
  })

  it('says why Continue is disabled, in words, next to it', () => {
    mockBp = 'compact'
    renderStep('courses', { primaryDisabled: true, primaryHint: 'Choose your age to continue.' })
    expect(screen.getByText('Choose your age to continue.')).toBeTruthy()
    expect(aria(screen.getByRole('button', { name: 'Continue' }), 'aria-disabled')).toBe(true)
  })

  it('shows no hint when there is none', () => {
    mockBp = 'compact'
    renderStep('courses')
    expect(screen.queryByText('Choose your age to continue.')).toBeNull()
  })

  it('desktop: a rail listing the four sections, the current one marked aria-current', () => {
    mockBp = 'expanded'
    renderStep()
    expect(screen.getByTestId('section-rail')).toBeTruthy()
    for (const s of ['About you', 'Your goal', 'Scholarship match', 'Quick check']) {
      expect(screen.getAllByText(s).length).toBeGreaterThan(0)
    }
    const current = screen.getByTestId('section-Your goal')
    expect(aria(current, 'aria-current')).toBe('step')
    expect(aria(screen.getByTestId('section-About you'), 'aria-current')).toBeUndefined()
  })

  it('desktop: keeps exactly one level-1 heading, the question', () => {
    mockBp = 'expanded'
    renderStep()
    const h1 = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 1)
    expect(h1).toHaveLength(1)
    expect(h1[0]).toHaveTextContent('Which courses are you considering?')
  })
})
