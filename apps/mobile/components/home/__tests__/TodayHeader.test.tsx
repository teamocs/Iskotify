import React from 'react'
import { Text } from 'react-native'
import { render, screen, within, fireEvent } from '@testing-library/react-native'
import { TodayHeader, eyebrowDate } from '../TodayHeader'
import { iosTextStyles, lightTheme } from '../../../theme/tokens'

// iOS redesign P4. The large-title header: a top row with the date eyebrow
// and the controls (refresh on web, reminders, the glass avatar that opens
// the Profile sheet), then the greeting in the large-title role at full
// width. Owner report (2026-09-26) still holds: the greeting is never
// squeezed beside the controls, so a long name wraps at a word boundary.

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

const flat = (node: any) => [node.props.style].flat(3).reduce((a: any, s: any) => (s && typeof s === 'object' ? { ...a, ...s } : a), {})

/** Every Text's props, so we can assert on numberOfLines/ellipsis. */
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

  it('draws the greeting in the large-title role', () => {
    renderHeader()
    const name = within(screen.getByTestId('today-header-greeting')).getByText('Maximiliana')
    expect(flat(name).fontSize).toBe(iosTextStyles.largeTitle.fontSize)
  })

  it('puts the controls in a top row, never beside the heading', () => {
    renderHeader()
    const top = screen.getByTestId('today-header-top')
    const heading = screen.getByTestId('today-header-greeting')
    expect(within(top).getByRole('button', { name: 'Study reminders' })).toBeTruthy()
    expect(within(top).getByRole('button', { name: 'Profile' })).toBeTruthy()
    expect(within(top).getByTestId('refresh-slot')).toBeTruthy()
    expect(within(top).queryByTestId('today-header-greeting')).toBeNull()
    expect(within(heading).queryByRole('button')).toBeNull()
  })

  it('the glass avatar opens the Profile sheet', () => {
    const { router } = require('expo-router')
    renderHeader()
    const profile = screen.getByRole('button', { name: 'Profile' })
    expect(within(profile).getByTestId('profile-glass')).toBeTruthy()
    fireEvent.press(profile)
    expect(router.push).toHaveBeenCalledWith('/profile')
  })

  it('never truncates or ellipsises the greeting or the name', () => {
    renderHeader()
    for (const p of textProps(screen.getByTestId('today-header-greeting'))) {
      expect(p.numberOfLines).toBeUndefined()
      expect(p.ellipsizeMode).toBeUndefined()
    }
  })

  it('shows the date as an uppercase footnote eyebrow in textSecondary, day before month', () => {
    renderHeader()
    const d = new Date(2026, 9, 12)
    expect(eyebrowDate(d)).toBe('Monday, 12 October')
    const eyebrow = within(screen.getByTestId('today-header-top')).getByText(eyebrowDate(new Date()))
    expect(flat(eyebrow)).toMatchObject({
      textTransform: 'uppercase',
      fontSize: iosTextStyles.footnote.fontSize,
      color: lightTheme.textSecondary,
    })
  })

  it('shows the streak as its own quiet line under the greeting', () => {
    renderHeader({ streakDays: 13 })
    const greeting = screen.getByTestId('today-header-greeting')
    expect(within(greeting).queryByText(/13-day streak/)).toBeNull()
    expect(screen.getByText('13-day streak')).toBeTruthy()
  })

  it('steps a very long first name down to title1 on a phone so it wraps at word boundaries, never mid-word', () => {
    renderHeader({ fullName: 'Christophersonn Reyes' })
    const name = within(screen.getByTestId('today-header-greeting')).getByText('Christophersonn')
    expect(flat(name).fontSize).toBe(iosTextStyles.title1.fontSize)
  })

  it('keeps the large title on wider screens even for a long name', () => {
    mockBp.value = 'expanded'
    renderHeader({ fullName: 'Christophersonn Reyes' })
    const name = within(screen.getByTestId('today-header-greeting')).getByText('Christophersonn')
    expect(flat(name).fontSize).toBe(iosTextStyles.largeTitle.fontSize)
  })

  it('falls back to "Student" when there is no name yet', () => {
    renderHeader({ fullName: '' })
    expect(screen.getByRole('header', { name: /, Student$/ })).toBeTruthy()
  })

  it('exposes the reminders on/off state as the button value, not only a hint', () => {
    const { rerender } = renderHeader({ remindersOn: false })
    expect(screen.getByRole('button', { name: 'Study reminders' }).props.accessibilityValue).toEqual({ text: 'Off' })
    rerender(
      <TodayHeader fullName={LONG_NAME} streakDays={0} remindersOn onOpenReminders={jest.fn()} />,
    )
    expect(screen.getByRole('button', { name: 'Study reminders' }).props.accessibilityValue).toEqual({ text: 'On' })
  })

  it('keeps 44pt targets on the controls', () => {
    renderHeader()
    for (const name of ['Study reminders', 'Profile']) {
      const s = flat(screen.getByRole('button', { name }))
      expect(s.minWidth).toBeGreaterThanOrEqual(44)
      expect(s.minHeight).toBeGreaterThanOrEqual(44)
    }
  })
})
