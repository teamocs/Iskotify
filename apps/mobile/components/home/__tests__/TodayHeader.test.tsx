import React from 'react'
import { Text } from 'react-native'
import { render, screen, within } from '@testing-library/react-native'
import { TodayHeader } from '../TodayHeader'

// Owner report (2026-09-26): on phones the greeting was squeezed into a narrow
// column beside the refresh, reminders and avatar controls, so "Good
// afternoon, Maximiliana" broke across three lines and the date split
// mid-phrase. The redesign gives the heading the full width: a top row holds
// the date and the controls, and the greeting sits on its own lines below.

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

const LONG_NAME = 'Maximiliana Dela Cruz-Villanueva'

function renderHeader(props: Partial<React.ComponentProps<typeof TodayHeader>> = {}) {
  return render(
    <TodayHeader
      fullName={LONG_NAME}
      streakDays={0}
      remindersOn={false}
      onOpenReminders={jest.fn()}
      refreshControl={<Text testID="refresh-slot">refresh</Text>}
      {...props}
    />,
  )
}

/** Every Text style flattened, so we can assert on numberOfLines/ellipsis. */
function textProps(node: any): any[] {
  const out: any[] = []
  const walk = (n: any) => {
    if (!n) return
    if (n.type === 'Text') out.push(n.props)
    ;(n.children ?? []).forEach((c: any) => typeof c === 'object' && walk(c))
  }
  walk(node)
  return out
}

describe('TodayHeader', () => {
  beforeEach(() => { mockBp.value = 'compact' })

  it('is one heading whose accessible name is the full greeting', () => {
    renderHeader()
    expect(screen.getByRole('header', { name: /^Good (morning|afternoon|evening), Maximiliana$/ })).toBeTruthy()
  })

  it('puts the controls in a top row, never beside the heading', () => {
    renderHeader()
    const top = screen.getByTestId('today-header-top')
    const heading = screen.getByTestId('today-header-greeting')
    // Controls live in the top row …
    expect(within(top).getByRole('button', { name: 'Study reminders' })).toBeTruthy()
    expect(within(top).getByRole('button', { name: 'Profile' })).toBeTruthy()
    expect(within(top).getByTestId('refresh-slot')).toBeTruthy()
    // … and the heading is not inside that row, so it gets the full width.
    expect(within(top).queryByTestId('today-header-greeting')).toBeNull()
    expect(within(heading).queryByRole('button')).toBeNull()
  })

  it('on a phone, the first name gets its own line under the greeting', () => {
    renderHeader()
    const greeting = screen.getByTestId('today-header-greeting')
    const line1 = within(greeting).getByText(/^Good (morning|afternoon|evening),$/)
    const line2 = within(greeting).getByText('Maximiliana')
    // Separate Text blocks (not one run that wraps wherever it happens to).
    expect(line1).not.toBe(line2)
    expect(within(line1).queryByText('Maximiliana')).toBeNull()
  })

  it('never truncates or ellipsises the greeting or the name', () => {
    renderHeader()
    for (const p of textProps(screen.getByTestId('today-header-greeting'))) {
      expect(p.numberOfLines).toBeUndefined()
      expect(p.ellipsizeMode).toBeUndefined()
    }
  })

  it('on a phone, uses the short date so it fits beside the controls without splitting', () => {
    renderHeader()
    const short = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())
    expect(within(screen.getByTestId('today-header-top')).getByText(short)).toBeTruthy()
  })

  it('on desktop, keeps the greeting on one line and spells the date out', () => {
    mockBp.value = 'expanded'
    renderHeader()
    const long = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
    expect(screen.getByText(long)).toBeTruthy()
    expect(within(screen.getByTestId('today-header-greeting')).getByText(/^Good (morning|afternoon|evening), /)).toBeTruthy()
  })

  it('shows the streak as its own quiet line under the name', () => {
    renderHeader({ streakDays: 13 })
    const greeting = screen.getByTestId('today-header-greeting')
    expect(within(greeting).queryByText(/13-day streak/)).toBeNull()
    expect(screen.getByText('13-day streak')).toBeTruthy()
  })

  it('steps a very long first name down a size on a phone so it wraps at word boundaries, never mid-word', () => {
    // 320pt phone at 2x font scale (capped 1.4): a 14-letter name in the 26pt
    // title role is wider than the column and would split mid-word.
    renderHeader({ fullName: 'Christophersonn Reyes' })
    const name = within(screen.getByTestId('today-header-greeting')).getByText('Christophersonn')
    const flat = [name.props.style].flat(3).reduce((a: any, s: any) => ({ ...a, ...s }), {})
    expect(flat.fontSize).toBeLessThanOrEqual(20)
  })

  it('keeps the title size for an ordinary first name', () => {
    renderHeader()
    const name = within(screen.getByTestId('today-header-greeting')).getByText('Maximiliana')
    const flat = [name.props.style].flat(3).reduce((a: any, s: any) => ({ ...a, ...s }), {})
    expect(flat.fontSize).toBe(26)
  })

  it('falls back to "Student" when there is no name yet', () => {
    renderHeader({ fullName: '' })
    expect(screen.getByRole('header', { name: /, Student$/ })).toBeTruthy()
  })

  it('keeps 44pt targets on the controls', () => {
    renderHeader()
    const bell = screen.getByRole('button', { name: 'Study reminders' })
    const flat = [bell.props.style].flat(3).reduce((a: any, s: any) => (typeof s === 'function' ? a : { ...a, ...s }), {})
    expect(flat.width).toBeGreaterThanOrEqual(44)
    expect(flat.height).toBeGreaterThanOrEqual(44)
  })
})
