/**
 * Glass header button (iOS redesign P2c): a 40pt glass disc inside a 44pt
 * target, with a required accessible name.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Gear1Outlined } from '@lineiconshq/free-icons'
import { lightTheme } from '../../../theme/tokens'
import { GlassIconButton } from '../GlassIconButton'

jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  usePlatformCapabilities: () => ({ liquidGlass: false, blurTier: 'opaque', reduceTransparency: false, reduceMotion: false }),
}))

const flat = (style: unknown, state = { pressed: false, focused: false }) =>
  StyleSheet.flatten(typeof style === 'function' ? style(state) : style)

describe('GlassIconButton', () => {
  it('is a named button with a 44pt hit target around a 40pt disc', () => {
    const onPress = jest.fn()
    render(<GlassIconButton icon={Gear1Outlined} accessibilityLabel="Settings" onPress={onPress} />)
    const btn = screen.getByRole('button', { name: 'Settings' })
    const p = screen.UNSAFE_root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === 'Settings')[0]!
    const style = flat(p.props.style)
    expect(style.minWidth).toBe(44)
    expect(style.minHeight).toBe(44)
    const disc = screen.UNSAFE_root.findAll((n: any) => n.props.variant === 'button')[0]!
    expect(StyleSheet.flatten(disc.props.style)).toMatchObject({ width: 40, height: 40 })
    fireEvent.press(btn)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('requires an accessible label (type-level) and passes it through', () => {
    // @ts-expect-error accessibilityLabel is required
    const el = <GlassIconButton icon={Gear1Outlined} onPress={() => {}} />
    expect(el).toBeTruthy()
    render(<GlassIconButton icon={Gear1Outlined} accessibilityLabel="Filters" accessibilityHint="Opens filters" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Filters' }).props.accessibilityHint).toBe('Opens filters')
  })

  it('draws the focus ring on keyboard focus', () => {
    render(<GlassIconButton icon={Gear1Outlined} accessibilityLabel="Settings" onPress={() => {}} />)
    const p = screen.UNSAFE_root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === 'Settings')[0]!
    expect(flat(p.props.style, { pressed: false, focused: true }).outlineColor).toBe(lightTheme.focusRing)
  })
})
