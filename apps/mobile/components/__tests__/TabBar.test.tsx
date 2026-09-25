/**
 * M1 navigation: exactly four destinations — Today / Practice / Explore /
 * Progress. Legacy routes (listings, updates, analytics) and Profile stay
 * registered in the navigator for deep links but never appear in the bar.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { TabBar } from '../TabBar'
import { activeDestination, TAB_DESTINATIONS } from '../navigation/destinations'

const ROUTE_NAMES = ['index', 'practice', 'explore', 'progress', 'listings', 'updates', 'analytics', 'profile']

function makeProps(activeName: string) {
  const routes = ROUTE_NAMES.map(name => ({ key: `${name}-key`, name }))
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  }
  return {
    state: { index: ROUTE_NAMES.indexOf(activeName), routes },
    navigation,
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as any
}

describe('TabBar', () => {
  it('shows exactly the four destinations, in order', () => {
    render(<TabBar {...makeProps('index')} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map(t => t.props.accessibilityLabel)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
  })

  it('does not render legacy or profile routes', () => {
    render(<TabBar {...makeProps('index')} />)
    for (const old of ['Home', 'Exams', 'Lists', 'Updates', 'Profile']) {
      expect(screen.queryByText(old)).toBeNull()
    }
  })

  it('groups the tabs in a tablist and exposes the selected tab', () => {
    render(<TabBar {...makeProps('explore')} />)
    // A container View is not itself focusable, so assert the role prop directly.
    expect(screen.getByTestId('tab-bar-tablist').props.accessibilityRole).toBe('tablist')
    expect(screen.getByRole('tab', { name: 'Explore' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    )
    expect(screen.getByRole('tab', { name: 'Today' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: false }),
    )
  })

  it('tab labels respect the 12pt floor', () => {
    render(<TabBar {...makeProps('index')} />)
    for (const label of ['Today', 'Practice', 'Explore', 'Progress']) {
      expect(StyleSheet.flatten(screen.getByText(label).props.style).fontSize).toBeGreaterThanOrEqual(12)
    }
  })

  it('each tab is at least 44pt tall', () => {
    render(<TabBar {...makeProps('index')} />)
    for (const tab of screen.getAllByRole('tab')) {
      const style = tab.props.style
      const flat = StyleSheet.flatten(typeof style === 'function' ? style({ pressed: false }) : style)
      expect(flat.minHeight).toBeGreaterThanOrEqual(44)
    }
  })

  it('navigates to an unfocused tab and emits tabPress', () => {
    const props = makeProps('index')
    render(<TabBar {...props} />)
    fireEvent.press(screen.getByRole('tab', { name: 'Progress' }))
    expect(props.navigation.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'progress-key' }))
    expect(props.navigation.navigate).toHaveBeenCalledWith('progress')
  })

  it('highlights Explore while a legacy Lists/Updates route is (briefly) focused', () => {
    render(<TabBar {...makeProps('updates')} />)
    expect(screen.getByRole('tab', { name: 'Explore' }).props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    )
  })
})

describe('destinations', () => {
  it('defines Today, Practice, Explore, Progress', () => {
    expect(TAB_DESTINATIONS.map(d => d.label)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
  })

  it.each([
    ['/', 'index'],
    ['/index', 'index'],
    ['/(tabs)', 'index'],
    ['/practice', 'practice'],
    ['/explore', 'explore'],
    ['/listings', 'explore'],
    ['/updates', 'explore'],
    ['/progress', 'progress'],
    ['/analytics', 'progress'],
    ['/(tabs)/progress', 'progress'],
    ['/profile', null],
    ['/settings', null],
  ])('maps %s → %s', (path, expected) => {
    expect(activeDestination(path)).toBe(expected)
  })
})
