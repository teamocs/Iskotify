/**
 * Entry frame on wide windows: the phone layout is one column; from the
 * expanded breakpoint (desktop web, large tablets) the form sits in a card
 * beside a brand panel, instead of a lone 440px column on an empty field.
 */
import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { AuthLayout } from '../AuthLayout'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

describe('AuthLayout', () => {
  it('phones: one column, no brand panel', () => {
    mockBp = 'compact'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.getByText('form')).toBeTruthy()
    expect(screen.queryByTestId('brand-panel')).toBeNull()
  })

  it('desktop: a brand panel with the tagline and what the app is for, beside the form', () => {
    mockBp = 'expanded'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.getByTestId('brand-panel')).toBeTruthy()
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    expect(screen.getByText(/UPCAT and other college entrance exams/)).toBeTruthy()
    expect(screen.getByText('form')).toBeTruthy()
  })

  it('the brand panel adds no heading of its own (the form keeps the one h1)', () => {
    mockBp = 'expanded'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.queryAllByRole('header')).toHaveLength(0)
  })
})
