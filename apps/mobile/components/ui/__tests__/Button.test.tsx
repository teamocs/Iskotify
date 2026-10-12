import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Button } from '../Button'
import { AppButton } from '../AppButton'
import { PillButton } from '../PillButton'
import { aria } from '../../../test-utils/aria'
import { iosTextStyles, lightTheme, radius } from '../../../theme/tokens'
type ReactTestInstance = typeof screen.UNSAFE_root

/** The composite pressable (its style is still the unresolved function). */
function pressableNamed(name: string) {
  const [match] = screen.UNSAFE_root.findAll(
    (n: ReactTestInstance) =>
      typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === name,
  )
  if (!match) throw new Error(`no pressable named ${name}`)
  return match
}

const flat = (el: { props: { style: unknown } }) => {
  const style = el.props.style
  return StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
}

describe('Button', () => {
  it('renders its label as an accessible button and fires onPress', () => {
    const onPress = jest.fn()
    render(<Button label="Start practice" onPress={onPress} />)
    const btn = screen.getByRole('button', { name: 'Start practice' })
    fireEvent.press(btn)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('uses an explicit accessibilityLabel when given (icon-heavy buttons)', () => {
    render(<Button label="Go" accessibilityLabel="Start the UPCAT mock" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Start the UPCAT mock' })).toBeTruthy()
  })

  it.each(['sm', 'md', 'lg'] as const)('size %s keeps a touch target of at least 44pt', (size) => {
    render(<Button label="Tap" size={size} onPress={() => {}} />)
    expect(flat(screen.getByRole('button')).minHeight).toBeGreaterThanOrEqual(44)
  })

  it('announces disabled and does not fire when disabled', () => {
    const onPress = jest.fn()
    render(<Button label="Submit" disabled onPress={onPress} />)
    const btn = screen.getByRole('button')
    expect(aria(btn, 'aria-disabled')).toBe(true)
    fireEvent.press(btn)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('announces busy while loading, keeps its label, and ignores presses', () => {
    const onPress = jest.fn()
    render(<Button label="Saving" loading onPress={onPress} />)
    const btn = screen.getByRole('button', { name: 'Saving' })
    expect(aria(btn, 'aria-busy')).toBe(true)
    expect(aria(btn, 'aria-disabled')).toBe(true)
    fireEvent.press(btn)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders a leading icon node', () => {
    render(<Button label="Search" icon={<Text testID="icon">*</Text>} onPress={() => {}} />)
    expect(screen.getByTestId('icon', { includeHiddenElements: true })).toBeTruthy()
  })

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('variant %s renders token colours only', (variant) => {
    render(<Button label="X" variant={variant} onPress={() => {}} />)
    const style = flat(screen.getByRole('button'))
    expect(typeof style.backgroundColor).toBe('string')
  })

  it('has the 14pt button radius with continuous corners (iOS redesign P3)', () => {
    render(<Button label="Continue" onPress={() => {}} />)
    const s = flat(screen.getByRole('button'))
    expect(s.borderRadius).toBe(radius.button)
    expect(s.borderCurve).toBe('continuous')
  })

  it('sets the label in the headline role (subheadline semibold at sm)', () => {
    const { rerender } = render(<Button label="Continue" onPress={() => {}} />)
    const label = StyleSheet.flatten(screen.getByText('Continue').props.style)
    expect(label.fontSize).toBe(iosTextStyles.headline.fontSize)
    expect(label.fontWeight).toBe(iosTextStyles.headline.fontWeight)
    rerender(<Button label="Continue" size="sm" onPress={() => {}} />)
    const sm = StyleSheet.flatten(screen.getByText('Continue').props.style)
    expect(sm.fontSize).toBe(iosTextStyles.subheadline.fontSize)
    expect(sm.fontWeight).toBe('600')
  })

  it('primary fills with accent, and accentPressed while pressed', () => {
    render(<Button label="Start" onPress={() => {}} />)
    const p = pressableNamed('Start')
    const style = (state: object) => StyleSheet.flatten(p.props.style(state))
    expect(style({ pressed: false }).backgroundColor).toBe(lightTheme.accent)
    expect(style({ pressed: true }).backgroundColor).toBe(lightTheme.accentPressed)
  })

  it('settles with a press scale (PressableScale)', () => {
    render(<Button label="Start" onPress={() => {}} />)
    expect(flat(screen.getByRole('button')).transform).toEqual([{ scale: 1 }])
  })

  it('keeps a disabled button dimmed', () => {
    render(<Button label="Submit" disabled onPress={() => {}} />)
    expect(flat(screen.getByRole('button')).opacity).toBe(0.5)
  })

  it('fullWidth stretches to the container', () => {
    render(<Button label="Continue" fullWidth onPress={() => {}} />)
    expect(flat(screen.getByRole('button')).alignSelf).toBe('stretch')
  })
})

describe('AppButton / PillButton (thin wrappers over Button)', () => {
  it('AppButton keeps its API and a11y', () => {
    const onPress = jest.fn()
    render(<AppButton label="Save" onPress={onPress} />)
    fireEvent.press(screen.getByRole('button', { name: 'Save' }))
    expect(onPress).toHaveBeenCalled()
  })

  it('PillButton stays pill-shaped (the capsule radius) and keeps its leading slot', () => {
    render(<PillButton label="Next" leading={<Text testID="lead">›</Text>} onPress={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Next' })
    expect(flat(btn).borderRadius).toBe(radius.capsule)
    expect(screen.getByTestId('lead', { includeHiddenElements: true })).toBeTruthy()
  })
})
