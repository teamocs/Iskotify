/**
 * The bottom navigation (iOS redesign P2c): the floating glass capsule with
 * exactly four destinations (Today / Practice / Explore / Progress) and a
 * separate search circle. `TabBar` stays a re-export for one release.
 * Detailed behaviour lives in navigation/__tests__/FloatingTabBar.test.tsx.
 */
import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { TabBar } from '../TabBar'
import { FloatingTabBar } from '../navigation/FloatingTabBar'
import { activeDestination, TAB_DESTINATIONS } from '../navigation/destinations'

jest.mock('../../hooks/useSafeInsets', () => ({ useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

const ROUTE_NAMES = ['index', 'practice', 'explore', 'progress', 'search']

function makeProps(activeName: string) {
  const routes = ROUTE_NAMES.map(name => ({ key: `${name}-key`, name }))
  return {
    state: { index: ROUTE_NAMES.indexOf(activeName), routes },
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as any
}

describe('TabBar (re-export)', () => {
  it('is the floating tab bar', () => {
    expect(TabBar).toBe(FloatingTabBar)
  })

  it('shows exactly the four destinations, in order, and never legacy or Profile routes', () => {
    render(<TabBar {...makeProps('index')} />)
    expect(screen.getAllByRole('tab').map(t => t.props.accessibilityLabel)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
    for (const old of ['Home', 'Exams', 'Lists', 'Updates', 'Profile']) expect(screen.queryByText(old)).toBeNull()
  })
})

describe('destinations', () => {
  it('defines Today, Practice, Explore, Progress', () => {
    expect(TAB_DESTINATIONS.map(d => d.label)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
  })

  it('gives Explore and Search different icons', () => {
    const { SEARCH_DESTINATION } = require('../navigation/destinations')
    expect(TAB_DESTINATIONS.find(d => d.name === 'explore')!.icon).not.toBe(SEARCH_DESTINATION.icon)
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
    ['/search', 'search'],
    ['/profile', null],
    ['/settings', null],
  ])('maps %s → %s', (path, expected) => {
    expect(activeDestination(path)).toBe(expected)
  })
})
