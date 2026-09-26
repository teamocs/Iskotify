import React from 'react'
import { render, screen, fireEvent, within } from '@testing-library/react-native'
import GwaCalculatorScreen from '../gwa'

jest.mock('expo-router', () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

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

function flat(style: unknown): Record<string, any> {
  const s = typeof style === 'function' ? style({ pressed: false }) : style
  return Object.assign({}, ...[s].flat(Infinity as 1).filter(Boolean))
}

describe('GwaCalculatorScreen (redesign M3)', () => {
  beforeEach(() => { mockBp.value = 'compact' })

  it('titles the page as an h1 with a named back button', () => {
    render(<GwaCalculatorScreen />)
    expect(screen.getByRole('header', { name: 'GWA calculator' }).props['aria-level']).toBe(1)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
  })

  it('labels each grade and units field by subject', () => {
    render(<GwaCalculatorScreen />)
    expect(screen.getByLabelText('Subject 1 grade')).toBeTruthy()
    expect(screen.getByLabelText('Subject 1 units')).toBeTruthy()
    expect(screen.getByLabelText('Subject 3 units')).toBeTruthy()
  })

  it('computes the GWA live in tabular numerals', () => {
    render(<GwaCalculatorScreen />)
    fireEvent.changeText(screen.getByLabelText('Subject 1 grade'), '1.25')
    fireEvent.changeText(screen.getByLabelText('Subject 1 units'), '3')
    fireEvent.changeText(screen.getByLabelText('Subject 2 grade'), '1.75')
    fireEvent.changeText(screen.getByLabelText('Subject 2 units'), '3')
    const value = screen.getByText('1.5000')
    expect(flat(value.props.style).fontVariant).toContain('tabular-nums')
    expect(screen.getByText('6 total units')).toBeTruthy()
  })

  it('adds and removes subjects with named 44pt controls', () => {
    render(<GwaCalculatorScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Add subject' }))
    expect(screen.getByLabelText('Subject 4 grade')).toBeTruthy()
    const remove = screen.getByRole('button', { name: 'Remove subject 4' })
    const style = flat(remove.props.style)
    expect(style.width).toBeGreaterThanOrEqual(44)
    expect(style.height).toBeGreaterThanOrEqual(44)
    fireEvent.press(remove)
    expect(screen.queryByLabelText('Subject 4 grade')).toBeNull()
  })

  it('marks an out-of-range grade with an error message', () => {
    render(<GwaCalculatorScreen />)
    fireEvent.changeText(screen.getByLabelText('Subject 1 grade'), '7')
    expect(screen.getByText(/between 1\.00 and 5\.00/)).toBeTruthy()
  })

  it('resets the rows', () => {
    render(<GwaCalculatorScreen />)
    fireEvent.changeText(screen.getByLabelText('Subject 1 grade'), '1.25')
    fireEvent.press(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByLabelText('Subject 1 grade').props.value).toBe('')
  })

  it('shows no glyph icons or uppercase eyebrow', () => {
    render(<GwaCalculatorScreen />)
    expect(screen.queryByText(/[←→+•]/)).toBeNull()
    expect(screen.queryByText('Your GWA')).toBeTruthy()
  })

  it('keeps the live GWA in a side column on desktop', () => {
    mockBp.value = 'expanded'
    render(<GwaCalculatorScreen />)
    expect(flat(screen.getByTestId('two-column').props.style).flexDirection).toBe('row')
    expect(flat(screen.getByTestId('screen-content').props.style).maxWidth).toBe(1040)
  })

  it('leads with the live GWA on phones', () => {
    render(<GwaCalculatorScreen />)
    const json = JSON.stringify(screen.toJSON())
    expect(json.indexOf('Your GWA')).toBeLessThan(json.indexOf('Subject 1 grade'))
  })
  describe('keyboard (iOS regression)', () => {
    beforeEach(() => { mockKasProps.length = 0 })

    it('scrolls the rows in a KeyboardAwareScrollView with a bottomOffset, not a plain ScrollView', () => {
      render(<GwaCalculatorScreen />)
      const kas = screen.getByTestId('keyboard-aware-scroll')
      expect(within(kas).getByLabelText('Subject 3 units')).toBeTruthy()
      expect(screen.queryByTestId('screen-scroll')).toBeNull()
      const last = mockKasProps[mockKasProps.length - 1]!
      expect(last.bottomOffset as number).toBeGreaterThan(0)
      expect(last.keyboardShouldPersistTaps).toBe('handled')
    })

    it('keeps the live-GWA side column on desktop inside the keyboard-aware scroller', () => {
      mockBp.value = 'expanded'
      render(<GwaCalculatorScreen />)
      const kas = screen.getByTestId('keyboard-aware-scroll')
      expect(within(kas).getByTestId('gwa-summary')).toBeTruthy()
      expect(within(kas).getByTestId('two-column')).toBeTruthy()
    })
  })
})
