/**
 * TextField — the app's one labelled text input (auth, onboarding, settings).
 * Contract: a visible label that is also the accessible name, a control
 * boundary drawn in `inputBorder` (≥3:1, WCAG 1.4.11), an error that is
 * announced and marks the field invalid, and — for passwords — a real 44pt
 * show/hide toggle that names its action.
 */
import React from 'react'
import { StyleSheet, TextInput } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { TextField } from '../TextField'
import { aria } from '../../../test-utils/aria'

const { useTheme } = require('../../../theme/ThemeContext')

function input() {
  return screen.UNSAFE_getByType(TextInput)
}

/** The bordered host View that wraps the TextInput. */
function frame() {
  let n: any = input().parent
  while (n && !(typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderWidth)) n = n.parent
  return StyleSheet.flatten(n.props.style)
}

describe('TextField', () => {
  it('shows the label and uses it as the accessible name', () => {
    render(<TextField label="Email address" value="" onChangeText={() => {}} />)
    expect(screen.getByText('Email address')).toBeTruthy()
    expect(input().props.accessibilityLabel).toBe('Email address')
  })

  it('draws its boundary with the inputBorder token, not the decorative border', () => {
    const { theme } = useTheme()
    render(<TextField label="Name" value="" onChangeText={() => {}} />)
    expect(frame().borderColor).toBe(theme.inputBorder)
  })

  it('switches to the focus colour while focused', () => {
    const { theme } = useTheme()
    render(<TextField label="Name" value="" onChangeText={() => {}} />)
    fireEvent(input(), 'focus')
    expect(frame().borderColor).toBe(theme.focusRing)
    fireEvent(input(), 'blur')
    expect(frame().borderColor).toBe(theme.inputBorder)
  })

  it('announces an error, marks the field invalid and describes it', () => {
    const { theme } = useTheme()
    render(<TextField label="Email address" value="x" onChangeText={() => {}} error="Enter a valid email address." />)
    const err = screen.getByText('Enter a valid email address.')
    expect(err.props.accessibilityRole).toBe('alert')
    expect(aria(input(), 'aria-invalid')).toBe(true)
    expect(aria(input(), 'aria-describedby')).toBe(err.props.nativeID)
    expect(frame().borderColor).toBe(theme.dangerBorder)
  })

  it('links a hint through aria-describedby when there is no error', () => {
    render(<TextField label="GWA" hint="Your latest average, 75 to 100" value="" onChangeText={() => {}} />)
    const hint = screen.getByText('Your latest average, 75 to 100')
    expect(aria(input(), 'aria-describedby')).toBe(hint.props.nativeID)
    expect(aria(input(), 'aria-invalid')).toBeFalsy()
  })

  it('marks a required field without reading an asterisk aloud', () => {
    render(<TextField label="Full name" required value="" onChangeText={() => {}} />)
    expect(aria(input(), 'aria-required')).toBe(true)
    const star = screen.queryByText('*', { includeHiddenElements: true })
    if (star) expect(aria(star, 'aria-hidden')).toBe(true)
  })

  it('forwards autocomplete / textContentType / keyboard props', () => {
    render(
      <TextField
        label="Email address" value="" onChangeText={() => {}}
        autoComplete="email" textContentType="emailAddress" inputMode="email" autoCapitalize="none"
      />,
    )
    expect(input().props.autoComplete).toBe('email')
    expect(input().props.textContentType).toBe('emailAddress')
    expect(input().props.inputMode).toBe('email')
  })

  describe('pressing the label (web: <label for> behaviour)', () => {
    it('focuses the input', () => {
      render(<TextField label="Full name" value="" onChangeText={() => {}} />)
      const focus = jest.spyOn(input().instance as { focus: () => void }, 'focus')
      fireEvent.press(screen.getByText('Full name'))
      expect(focus).toHaveBeenCalledTimes(1)
    })

    it('still forwards the caller ref to the input', () => {
      const ref = React.createRef<TextInput>()
      render(<TextField ref={ref} label="Full name" value="" onChangeText={() => {}} />)
      expect(ref.current).toBe(input().instance)
    })

    it('keeps the input as the only named control (the label is not a second button)', () => {
      render(<TextField label="Full name" value="" onChangeText={() => {}} />)
      expect(screen.queryByRole('button', { name: 'Full name' })).toBeNull()
      const named = screen.getAllByLabelText('Full name')
      expect(named).toHaveLength(1)
      expect(named[0]!.props.value).toBe('')
      expect(named[0]!.props.onChangeText).toBeDefined()
    })
  })

  describe('password visibility toggle', () => {
    it('starts hidden and toggles with a 44pt button that names its action', () => {
      render(<TextField label="Password" value="secret123" onChangeText={() => {}} secureToggle />)
      expect(input().props.secureTextEntry).toBe(true)
      const toggle = screen.getByRole('button', { name: 'Show password' })
      const st = StyleSheet.flatten(typeof toggle.props.style === 'function' ? toggle.props.style({ pressed: false }) : toggle.props.style)
      expect(st.minHeight ?? st.height).toBeGreaterThanOrEqual(44)
      expect(st.minWidth ?? st.width).toBeGreaterThanOrEqual(44)
      expect(screen.getByText('Show')).toBeTruthy()

      fireEvent.press(toggle)
      expect(input().props.secureTextEntry).toBe(false)
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeTruthy()
      expect(screen.getByText('Hide')).toBeTruthy()
    })

    it('reports its pressed state through aria-pressed', () => {
      render(<TextField label="Password" value="" onChangeText={() => {}} secureToggle />)
      expect(aria(screen.getByRole('button', { name: 'Show password' }), 'aria-pressed')).toBe(false)
      fireEvent.press(screen.getByRole('button', { name: 'Show password' }))
      expect(aria(screen.getByRole('button', { name: 'Hide password' }), 'aria-pressed')).toBe(true)
    })
  })
})
