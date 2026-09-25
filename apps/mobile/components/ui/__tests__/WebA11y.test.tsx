/**
 * Web (react-native-web) accessibility contract for the design-system
 * primitives. RNW ignores `importantForAccessibility` and
 * `accessibilityElementsHidden`, defaults Pressable's tabIndex to 0, and only
 * lets Space activate role="button" — so each of those needs an explicit web
 * counterpart. Native behaviour must stay unchanged.
 */
import React from 'react'
import { Modal, Platform, StyleSheet, Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
type ReactTestInstance = typeof screen.UNSAFE_root

jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: jest.fn(() => 'compact'),
}))

import { Button } from '../Button'
import { ListRow } from '../ListRow'
import { Chip, FilterChip } from '../Chip'
import { Avatar } from '../Avatar'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Sheet } from '../Sheet'
import { StatNumber } from '../StatNumber'
import { focusRing, setInputModality } from '../a11y'

// Matches __mocks__/themeContextMock.js (dark theme).
const FOCUS_RING = '#fca5a5'

/** Every node hidden from native AT must also be aria-hidden for the web build. */
function expectNativeHiddenAlsoAriaHidden() {
  const hidden = screen.UNSAFE_root.findAll(
    (n: ReactTestInstance) =>
      typeof n.type === 'string' && n.props.importantForAccessibility === 'no-hide-descendants',
  )
  expect(hidden.length).toBeGreaterThan(0)
  for (const node of hidden) expect(node.props['aria-hidden']).toBe(true)
}

/** The composite Pressable (its `style` is still the unresolved function). */
function pressableNamed(name: string) {
  const [match] = screen.UNSAFE_root.findAll(
    (n: ReactTestInstance) =>
      typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === name,
  )
  if (!match) throw new Error(`no Pressable named ${name}`)
  return match
}

function styleFor(p: ReactTestInstance, state: { pressed: boolean; focused?: boolean; hovered?: boolean }) {
  const style = p.props.style
  return StyleSheet.flatten(typeof style === 'function' ? style(state) : style)
}

function expectFocusRing(p: ReactTestInstance) {
  const ring = styleFor(p, { pressed: false, focused: true })
  expect(ring.outlineColor).toBe(FOCUS_RING)
  expect(ring.outlineStyle).toBe('solid')
  expect(ring.outlineWidth).toBeGreaterThanOrEqual(2)
  expect(ring.outlineOffset).toBeGreaterThanOrEqual(2)
  const idle = styleFor(p, { pressed: false, focused: false })
  expect(idle.outlineWidth ?? 0).toBe(0)
}

beforeEach(() => setInputModality('keyboard'))

describe('decorative nodes are aria-hidden on web too', () => {
  it('Button icon', () => {
    render(<Button label="Search" icon={<Text>*</Text>} onPress={() => {}} />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('ListRow leading and chevron', () => {
    render(<ListRow title="Row" leading={<Text>L</Text>} onPress={() => {}} />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('Avatar initials', () => {
    render(<Avatar name="Ana Reyes" />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('EmptyState icon', () => {
    render(<EmptyState icon={<Text>i</Text>} title="Nothing yet" />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('ErrorState icon', () => {
    render(<ErrorState onRetry={() => {}} />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('FilterChip check glyph', () => {
    render(<FilterChip label="Open" selected onPress={() => {}} />)
    expectNativeHiddenAlsoAriaHidden()
  })

  it('Sheet backdrop and grabber', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    expect(screen.getByTestId('sheet-backdrop', { includeHiddenElements: true }).props['aria-hidden']).toBe(true)
    expect(screen.getByTestId('sheet-grabber', { includeHiddenElements: true }).props['aria-hidden']).toBe(true)
    expectNativeHiddenAlsoAriaHidden()
  })
})

describe('Sheet dialog on web', () => {
  it('names the dialog by its title (aria-labelledby → the title nativeID)', () => {
    render(<Sheet visible title="Review answers" onClose={() => {}}><Text>Body</Text></Sheet>)
    const labelledBy = screen.UNSAFE_getByType(Modal).props['aria-labelledby']
    expect(typeof labelledBy).toBe('string')
    expect(screen.getByRole('header', { name: 'Review answers' }).props.nativeID).toBe(labelledBy)
  })

  it('labels the panel with the title on web as well as native', () => {
    const original = Platform.OS
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'web' })
    try {
      render(<Sheet visible title="Review answers" onClose={() => {}}><Text>Body</Text></Sheet>)
      expect(screen.getByTestId('sheet-panel').props.accessibilityLabel).toBe('Review answers')
    } finally {
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original })
    }
  })

  it('keeps the backdrop out of the tab order but still closes on tap', () => {
    const onClose = jest.fn()
    render(<Sheet visible title="Filters" onClose={onClose}><Text>Body</Text></Sheet>)
    const backdrop = screen.getByTestId('sheet-backdrop', { includeHiddenElements: true })
    expect(backdrop.props.tabIndex).toBe(-1)
    expect(backdrop.props.focusable).toBe(false)
    fireEvent.press(backdrop)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the close button precedes the backdrop in DOM order, so the focus trap lands on it first', () => {
    render(<Sheet visible title="Filters" onClose={() => {}}><Text>Body</Text></Sheet>)
    // RNW's modal focus trap calls .focus() on descendants in document order;
    // a tabIndex=-1 element still accepts programmatic focus, so order matters.
    const pressables = screen.UNSAFE_root.findAll(
      (n: ReactTestInstance) => typeof n.type === 'string' && typeof n.props.onResponderGrant === 'function',
    )
    expect(pressables[0]!.props.accessibilityLabel).toBe('Close')
  })
})

describe('keyboard focus ring (web)', () => {
  it('Button', () => {
    render(<Button label="Go" onPress={() => {}} />)
    expectFocusRing(pressableNamed('Go'))
  })

  it('ListRow', () => {
    render(<ListRow title="Row" onPress={() => {}} />)
    expectFocusRing(pressableNamed('Row'))
  })

  it('FilterChip', () => {
    render(<FilterChip label="Open" selected={false} onPress={() => {}} />)
    expectFocusRing(pressableNamed('Open'))
  })

  it('is not drawn after pointer input (mouse clicks focus too)', () => {
    setInputModality('pointer')
    render(<Button label="Go" onPress={() => {}} />)
    expect(styleFor(pressableNamed('Go'), { pressed: false, focused: true }).outlineWidth ?? 0).toBe(0)
  })

  it('focusRing() is null when not focused (native never reports focus)', () => {
    expect(focusRing(FOCUS_RING, undefined)).toBeNull()
    expect(focusRing(FOCUS_RING, false)).toBeNull()
  })
})

describe('FilterChip keyboard activation', () => {
  it.each([
    ['radio', {}],
    ['checkbox', { mode: 'multiple' as const }],
    ['tab', { role: 'tab' as const }],
  ])('Space toggles a %s chip, like Enter', (role, extra) => {
    const onPress = jest.fn()
    render(<FilterChip label="Open" selected={false} onPress={onPress} {...extra} />)
    const preventDefault = jest.fn()
    fireEvent(screen.getByRole(role as 'radio', { name: 'Open' }), 'keyDown', { key: ' ', preventDefault })
    expect(onPress).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalled()
  })

  it('ignores auto-repeat and other keys', () => {
    const onPress = jest.fn()
    render(<FilterChip label="Open" selected={false} onPress={onPress} />)
    const chip = screen.getByRole('radio', { name: 'Open' })
    fireEvent(chip, 'keyDown', { key: ' ', repeat: true, preventDefault: jest.fn() })
    fireEvent(chip, 'keyDown', { key: 'a', preventDefault: jest.fn() })
    expect(onPress).not.toHaveBeenCalled()
  })
})

describe('text can grow to 200%', () => {
  const multiplier = (text: string) => screen.getByText(text).props.maxFontSizeMultiplier

  it('Button label', () => {
    render(<Button label="Go" onPress={() => {}} />)
    expect(multiplier('Go')).toBe(2)
  })

  it('ListRow title and subtitle', () => {
    render(<ListRow title="Title" subtitle="Sub" />)
    expect(multiplier('Title')).toBe(2)
    expect(multiplier('Sub')).toBe(2)
  })

  it('Chip and FilterChip labels', () => {
    render(<><Chip label="Tag" /><FilterChip label="Open" selected={false} onPress={() => {}} /></>)
    expect(multiplier('Tag')).toBe(2)
    expect(multiplier('Open')).toBe(2)
  })

  it('StatNumber keeps a deliberate 1.5 cap on the big number only', () => {
    render(<StatNumber value={12} unit="days" label="Until UPCAT" />)
    expect(multiplier('12')).toBe(1.5)
    expect(multiplier('days')).toBe(2)
    expect(multiplier('Until UPCAT')).toBe(2)
  })
})
