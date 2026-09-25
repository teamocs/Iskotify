/**
 * Redesign M2 shared fixes (brief Part B): Sheet keyboard avoidance, ListRow
 * web hover, InfoBanner's action target, MatchPill contrast.
 */
import React from 'react'
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
type ReactTestInstance = typeof screen.UNSAFE_root

jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: jest.fn(() => 'compact'),
}))

import { Sheet } from '../Sheet'
import { ListRow } from '../ListRow'
import { InfoBanner } from '../InfoBanner'
import { fonts } from '../../../theme/tokens'
import { aria } from '../../../test-utils/aria'

const { useTheme } = require('../../../theme/ThemeContext')

function pressableNamed(name: string) {
  const [match] = screen.UNSAFE_root.findAll(
    (n: ReactTestInstance) =>
      typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === name,
  )
  if (!match) throw new Error(`no Pressable named ${name}`)
  return match
}
function styleFor(p: ReactTestInstance, state: { pressed: boolean; hovered?: boolean; focused?: boolean }) {
  const style = p.props.style
  return StyleSheet.flatten(typeof style === 'function' ? style(state) : style)
}

describe('Sheet keyboard avoidance', () => {
  const original = Platform.OS
  afterEach(() => { Platform.OS = original })

  it('wraps the panel in a padding KeyboardAvoidingView on native so inputs stay visible', () => {
    Platform.OS = 'android'
    render(
      <Sheet visible title="Suggest a date" onClose={() => {}}>
        <TextInput accessibilityLabel="Date" />
      </Sheet>,
    )
    const kav = screen.UNSAFE_getByType(KeyboardAvoidingView)
    expect(kav.props.behavior).toBe('padding')
    // The panel is inside it, so the keyboard lifts the panel, not just the backdrop.
    expect(kav.findAll((n: ReactTestInstance) => n.props.testID === 'sheet-panel').length).toBeGreaterThan(0)
  })

  it('does not add keyboard avoidance on web (the browser resizes the viewport)', () => {
    Platform.OS = 'web'
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(screen.UNSAFE_queryAllByType(KeyboardAvoidingView)).toHaveLength(0)
  })
})

describe('ListRow web hover', () => {
  it('tints a pressable row on hover, and more strongly on press', () => {
    const { theme } = useTheme()
    render(<ListRow title="Row" onPress={() => {}} />)
    const row = pressableNamed('Row')
    expect(styleFor(row, { pressed: false }).backgroundColor).toBeUndefined()
    expect(styleFor(row, { pressed: false, hovered: true }).backgroundColor).toBe(theme.surfaceSubtle)
    expect(styleFor(row, { pressed: true, hovered: true }).backgroundColor).toBe(theme.surface2)
  })

  it('does not show hover on a disabled row', () => {
    render(<ListRow title="Row" onPress={() => {}} disabled />)
    expect(styleFor(pressableNamed('Row'), { pressed: false, hovered: true }).backgroundColor).toBeUndefined()
  })

  it('announces disabled through aria-disabled (react-native-web ignores accessibilityState)', () => {
    render(<ListRow title="Row" onPress={() => {}} disabled />)
    expect(pressableNamed('Row').props['aria-disabled']).toBe(true)
  })
})

describe('InfoBanner', () => {
  it('gives its action a real 44pt target instead of hitSlop', () => {
    render(<InfoBanner message="Add an exam" actionLabel="Explore" onAction={() => {}} />)
    const action = pressableNamed('Explore')
    expect(action.props.hitSlop).toBeUndefined()
    const st = styleFor(action, { pressed: false })
    expect(st.minHeight).toBeGreaterThanOrEqual(44)
    expect(st.minWidth).toBeGreaterThanOrEqual(44)
  })

  it('runs the action on press', () => {
    const onAction = jest.fn()
    render(<InfoBanner message="Add an exam" actionLabel="Explore" onAction={onAction} />)
    fireEvent.press(screen.getByRole('button', { name: 'Explore' }))
    expect(onAction).toHaveBeenCalledTimes(1)
  })

  it('takes type from the token roles, not hard-coded font names', () => {
    render(<InfoBanner message="Add an exam" actionLabel="Explore" onAction={() => {}} />)
    const msg = StyleSheet.flatten(screen.getByText('Add an exam').props.style)
    const act = StyleSheet.flatten(screen.getByText('Explore').props.style)
    expect(Object.values(fonts)).toContain(msg.fontFamily)
    expect(Object.values(fonts)).toContain(act.fontFamily)
    expect(act.fontWeight).toBeUndefined()
  })

  it('renders no icon wrapper when there is no icon, and a decorative sized one when there is', () => {
    const { rerender } = render(<InfoBanner message="m" />)
    expect(screen.queryByTestId('info-banner-icon', { includeHiddenElements: true })).toBeNull()
    rerender(<InfoBanner message="m" icon={<Text>i</Text>} />)
    const wrap = screen.getByTestId('info-banner-icon', { includeHiddenElements: true })
    expect(aria(wrap, 'aria-hidden')).toBe(true)
    const st = StyleSheet.flatten(wrap.props.style)
    expect(st.width).toBeGreaterThanOrEqual(20)
    expect(st.alignItems).toBe('center')
  })
})
