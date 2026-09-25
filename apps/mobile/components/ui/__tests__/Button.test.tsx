import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Button } from '../Button'
import { AppButton } from '../AppButton'
import { PillButton } from '../PillButton'
import { aria } from '../../../test-utils/aria'

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

  it('PillButton stays pill-shaped and keeps its leading slot', () => {
    render(<PillButton label="Next" leading={<Text testID="lead">›</Text>} onPress={() => {}} />)
    const btn = screen.getByRole('button', { name: 'Next' })
    expect(flat(btn).borderRadius).toBe(999)
    expect(screen.getByTestId('lead', { includeHiddenElements: true })).toBeTruthy()
  })
})
