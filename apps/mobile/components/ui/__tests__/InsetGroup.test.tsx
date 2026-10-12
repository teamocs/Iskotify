/**
 * InsetGroup / InsetRow (iOS redesign P3): the grouped list. Rows grow with
 * Dynamic Type (minHeight, never height), separators are hairlines inset to
 * the text and absent under the last row, the header is a real heading, and
 * a switch row is one named switch with its state and hint.
 */
import React from 'react'
import { StyleSheet, Switch, Text } from 'react-native'
import { render, screen, fireEvent, within } from '@testing-library/react-native'
import { Search1Outlined } from '@lineiconshq/free-icons'
import { InsetGroup, InsetRow, IconTile } from '../InsetGroup'
import { layout, lightTheme, radius } from '../../../theme/tokens'
import { aria } from '../../../test-utils/aria'
type ReactTestInstance = typeof screen.UNSAFE_root

jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => 'compact',
}))

const flat = (el: ReactTestInstance, state = { pressed: false }) => {
  const style = el.props.style
  return StyleSheet.flatten(typeof style === 'function' ? style(state) : style) as Record<string, unknown>
}

/** The composite pressable (its style is still the unresolved function). */
function pressableNamed(name: string) {
  const [match] = screen.UNSAFE_root.findAll(
    (n: ReactTestInstance) =>
      typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === name,
  )
  if (!match) throw new Error(`no pressable named ${name}`)
  return match
}

const separators = () => screen.queryAllByTestId('inset-row-separator', { includeHiddenElements: true })

describe('InsetGroup', () => {
  it('is a surface panel with the group radius and continuous corners', () => {
    render(<InsetGroup><InsetRow title="Notifications" /></InsetGroup>)
    const panel = flat(screen.getByTestId('inset-group'))
    expect(panel.backgroundColor).toBe(lightTheme.surface)
    expect(panel.borderRadius).toBe(radius.group)
    expect(panel.borderCurve).toBe('continuous')
  })

  it('is inset by the page gutter', () => {
    render(<InsetGroup testID="g"><InsetRow title="A" /></InsetGroup>)
    expect(flat(screen.getByTestId('g')).marginHorizontal).toBe(16)
  })

  it('exposes its header as a heading in sentence case, and shows a footer', () => {
    render(
      <InsetGroup header="Study reminders" footer="We only remind you on days you plan to study.">
        <InsetRow title="Daily reminder" />
      </InsetGroup>,
    )
    const header = screen.getByRole('header', { name: 'Study reminders' })
    expect(flat(header).color).toBe(lightTheme.textSecondary)
    expect(flat(header).textTransform).toBeUndefined()
    expect(screen.getByText('We only remind you on days you plan to study.')).toBeTruthy()
  })
})

describe('InsetRow', () => {
  it('uses minHeight 44, never a fixed height, so it grows with Dynamic Type', () => {
    render(
      <InsetGroup>
        <InsetRow title="Static" testID="inset-row" />
        <InsetRow title="Tap me" onPress={() => {}} testID="inset-row" />
      </InsetGroup>,
    )
    for (const row of screen.getAllByTestId('inset-row', { includeHiddenElements: true })) {
      const s = flat(row)
      expect(s.minHeight).toBe(layout.rowMinHeight)
      expect(s.height).toBeUndefined()
    }
    const pressable = flat(pressableNamed('Tap me'))
    expect(pressable.minHeight).toBe(44)
    expect(pressable.height).toBeUndefined()
  })

  it('draws a hairline separator between rows and none under the last row', () => {
    render(
      <InsetGroup>
        <InsetRow title="One" />
        <InsetRow title="Two" />
        <InsetRow title="Three" />
      </InsetGroup>,
    )
    const seps = separators()
    expect(seps).toHaveLength(2)
    const s = flat(seps[0]!)
    expect(s.height).toBe(StyleSheet.hairlineWidth)
    expect(s.backgroundColor).toBe(lightTheme.divider)
  })

  it('insets the separator to the text, past the icon tile', () => {
    render(
      <InsetGroup>
        <InsetRow title="Search" icon={Search1Outlined} testID="inset-row" />
        <InsetRow title="Last" testID="inset-row" />
      </InsetGroup>,
    )
    const [first] = screen.getAllByTestId('inset-row', { includeHiddenElements: true })
    const body = within(first!).getByTestId('inset-row-body', { includeHiddenElements: true })
    // The separator lives in the text column, so it starts at the text's leading edge…
    expect(within(body).getByTestId('inset-row-separator', { includeHiddenElements: true })).toBeTruthy()
    expect(within(body).getByText('Search')).toBeTruthy()
    expect(flat(within(body).getByTestId('inset-row-separator', { includeHiddenElements: true })).left).toBe(0)
    // …and the icon tile sits outside it.
    expect(within(body).queryByTestId('icon-tile', { includeHiddenElements: true })).toBeNull()
    expect(within(first!).getByTestId('icon-tile', { includeHiddenElements: true })).toBeTruthy()
  })

  it('counts rows inside Fragments, so separators and the last row stay right', () => {
    render(
      <InsetGroup>
        <>
          <InsetRow title="One" />
          <InsetRow title="Two" />
        </>
        {false}
        <>
          <InsetRow title="Three" testID="last" />
        </>
      </InsetGroup>,
    )
    expect(separators()).toHaveLength(2)
    expect(within(screen.getByTestId('last')).queryByTestId('inset-row-separator', { includeHiddenElements: true })).toBeNull()
  })

  it('sets no testID unless the caller passes one', () => {
    render(<InsetRow title="Plain" onPress={() => {}} />)
    expect(screen.getByRole('button', { name: 'Plain' }).props.testID).toBeUndefined()
  })

  it('shows no separator outside a group (a lone row)', () => {
    render(<InsetRow title="Alone" />)
    expect(separators()).toHaveLength(0)
  })

  it('a pressable row is a button by default and a link when asked, named by title and subtitle', () => {
    const onPress = jest.fn()
    const { rerender } = render(<InsetRow title="Privacy policy" subtitle="How we use your data" onPress={onPress} />)
    fireEvent.press(screen.getByRole('button', { name: 'Privacy policy, How we use your data' }))
    expect(onPress).toHaveBeenCalledTimes(1)
    rerender(<InsetRow title="Privacy policy" onPress={onPress} accessibilityRole="link" />)
    expect(screen.getByRole('link', { name: 'Privacy policy' })).toBeTruthy()
  })

  it('a static row is not announced as a control', () => {
    render(<InsetRow title="Version" value="2.4.0" />)
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getByText('2.4.0')).toBeTruthy()
  })

  it('carries a trailing value as the accessibility value of a pressable row', () => {
    render(<InsetRow title="Exam" value="UPCAT" onPress={() => {}} />)
    const row = screen.getByRole('button', { name: 'Exam' })
    expect(row.props.accessibilityValue).toEqual({ text: 'UPCAT' })
  })

  it('shows a chevron on pressable rows by default, decorative', () => {
    const { rerender } = render(<InsetRow title="Open" onPress={() => {}} />)
    const chevron = screen.getByTestId('list-row-chevron', { includeHiddenElements: true })
    expect(aria(chevron, 'aria-hidden')).toBe(true)
    rerender(<InsetRow title="Open" onPress={() => {}} chevron={false} />)
    expect(screen.queryByTestId('list-row-chevron', { includeHiddenElements: true })).toBeNull()
  })

  it('highlights subtly on press and on web hover', () => {
    render(<InsetRow title="Row" onPress={() => {}} />)
    const row = pressableNamed('Row')
    expect(flat(row, { pressed: false }).backgroundColor).toBeUndefined()
    expect(flat(row, { pressed: false, hovered: true } as never).backgroundColor).toBe(lightTheme.surfaceSubtle)
    expect(flat(row, { pressed: true }).backgroundColor).toBe(lightTheme.surface2)
  })

  it('announces disabled through aria-disabled and ignores presses', () => {
    const onPress = jest.fn()
    render(<InsetRow title="Row" onPress={onPress} disabled />)
    const row = screen.getByRole('button', { name: 'Row' })
    expect(aria(row, 'aria-disabled')).toBe(true)
    fireEvent.press(row)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders a custom trailing node', () => {
    render(<InsetRow title="Row" trailing={<Text testID="trail">T</Text>} />)
    expect(screen.getByTestId('trail')).toBeTruthy()
  })
})

describe('InsetRow switch', () => {
  it('is one accessible switch, named by the title, with its state and the subtitle as hint', () => {
    render(
      <InsetRow
        title="Daily reminder"
        subtitle="A nudge at 7 pm"
        switchValue
        onSwitchChange={() => {}}
      />,
    )
    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(1)
    const sw = screen.getByRole('switch', { name: 'Daily reminder' })
    expect(aria(sw, 'aria-checked')).toBe(true)
    expect(sw.props.accessibilityHint).toBe('A nudge at 7 pm')
    // No second control: the native Switch inside is decorative and not focusable.
    expect(screen.queryByRole('button')).toBeNull()
    const inner = screen.UNSAFE_getByType(Switch)
    expect(inner.props.focusable).toBe(false)
    expect(inner.props.accessible).toBe(false)
  })

  it('toggles when the whole row is tapped', () => {
    const onChange = jest.fn()
    const { rerender } = render(<InsetRow title="Sounds" switchValue={false} onSwitchChange={onChange} />)
    fireEvent.press(screen.getByRole('switch', { name: 'Sounds' }))
    expect(onChange).toHaveBeenLastCalledWith(true)
    rerender(<InsetRow title="Sounds" switchValue onSwitchChange={onChange} />)
    fireEvent.press(screen.getByRole('switch', { name: 'Sounds' }))
    expect(onChange).toHaveBeenLastCalledWith(false)
  })

  it('prefers an explicit hint, and reports off', () => {
    render(<InsetRow title="Sounds" switchValue={false} onSwitchChange={() => {}} accessibilityHint="Plays a tone on a correct answer" />)
    const sw = screen.getByRole('switch', { name: 'Sounds' })
    expect(aria(sw, 'aria-checked')).toBe(false)
    expect(sw.props.accessibilityHint).toBe('Plays a tone on a correct answer')
  })

  it('a disabled switch row is dimmed, announced disabled and not toggleable', () => {
    const onChange = jest.fn()
    render(<InsetRow title="Weekly summary" subtitle="Sunday nudge" switchValue={false} onSwitchChange={onChange} disabled />)
    const sw = screen.getByRole('switch', { name: 'Weekly summary' })
    expect(aria(sw, 'aria-disabled')).toBe(true)
    expect(StyleSheet.flatten(sw.props.style).opacity).toBe(0.5)
    fireEvent.press(sw)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('IconTile', () => {
  it('is a 30pt decorative tile with a small continuous radius', () => {
    render(<IconTile icon={Search1Outlined} />)
    const tile = screen.getByTestId('icon-tile', { includeHiddenElements: true })
    const s = flat(tile)
    expect(s.width).toBe(layout.iconTile)
    expect(s.height).toBe(layout.iconTile)
    expect(s.borderRadius).toBeGreaterThanOrEqual(7)
    expect(s.borderRadius).toBeLessThanOrEqual(8)
    expect(s.borderCurve).toBe('continuous')
    expect(aria(tile, 'aria-hidden')).toBe(true)
  })

  it('tinted uses the tone surface; solid uses the tone with a white glyph', () => {
    const { rerender } = render(<IconTile icon={Search1Outlined} tone="success" />)
    expect(flat(screen.getByTestId('icon-tile', { includeHiddenElements: true })).backgroundColor).toBe(lightTheme.successSurface)
    rerender(<IconTile icon={Search1Outlined} tone="danger" solid />)
    expect(flat(screen.getByTestId('icon-tile', { includeHiddenElements: true })).backgroundColor).toBe(lightTheme.danger)
  })
})
