/**
 * Regression: resizing a desktop browser across the 1024 breakpoint used to
 * swap between two different trees, each with its own <Tabs>. The navigator
 * remounted, every tab screen remounted without its useFocusEffect load ever
 * firing, and screens sat on skeletons until a reload. There is now ONE
 * navigator; only the chrome (bottom bar vs sidebar) changes.
 */
import React from 'react'
import { Platform, Text } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'

const mockMounts = { tabs: 0, tabsUnmounts: 0 }
let mockTabBarProp: ((p: unknown) => React.ReactNode) | undefined
let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
let mockSwipeEnabled: boolean | undefined

jest.mock('expo-router', () => {
  const React = require('react')
  const { Text } = require('react-native')
  function Tabs({ tabBar }: { tabBar?: (p: unknown) => React.ReactNode }) {
    mockTabBarProp = tabBar
    React.useEffect(() => {
      mockMounts.tabs += 1
      return () => { mockMounts.tabsUnmounts += 1 }
    }, [])
    return React.createElement(Text, { testID: 'tabs-navigator' }, 'tabs')
  }
  Tabs.Screen = function TabsScreen() { return null }
  return { Tabs, router: { push: jest.fn(), navigate: jest.fn() }, usePathname: () => '/' }
})

jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))
jest.mock('../../../hooks/useDb', () => ({ useDb: () => ({}) }))
jest.mock('../../../services/sync', () => ({ syncOnLaunch: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../../components/SyncErrorBanner', () => ({ SyncErrorBanner: () => null }))
jest.mock('../../../components/TabBar', () => ({
  TabBar: () => require('react').createElement(require('react-native').Text, null, 'bottom-tab-bar'),
}))
jest.mock('../../../components/web/SidebarNav', () => ({
  SidebarNav: () => require('react').createElement(require('react-native').Text, { testID: 'sidebar-nav' }, 'sidebar'),
}))
jest.mock('../../../components/EdgeSwipeNavigator', () => ({
  EdgeSwipeNavigator: ({ children, enabled }: { children: React.ReactNode; enabled?: boolean }) => {
    mockSwipeEnabled = enabled
    return children
  },
}))

import TabLayout from '../_layout'

const originalOS = Platform.OS
beforeEach(() => {
  mockMounts.tabs = 0
  mockMounts.tabsUnmounts = 0
  mockBp = 'compact'
  Platform.OS = 'web'
})
afterAll(() => { Platform.OS = originalOS })

function renderTabBar() {
  const out = mockTabBarProp?.({})
  return render(<>{out ?? <Text>no-bar</Text>}</>)
}

describe('TabLayout across the desktop breakpoint', () => {
  it('keeps the same navigator mounted when the window grows past 1024 and back', () => {
    const r = render(<TabLayout />)
    expect(mockMounts.tabs).toBe(1)
    expect(screen.queryByTestId('sidebar-nav')).toBeNull()

    mockBp = 'expanded'
    r.rerender(<TabLayout />)
    expect(screen.getByTestId('sidebar-nav')).toBeTruthy()

    mockBp = 'compact'
    r.rerender(<TabLayout />)
    expect(screen.queryByTestId('sidebar-nav')).toBeNull()

    expect(mockMounts.tabs).toBe(1)
    expect(mockMounts.tabsUnmounts).toBe(0)
  })

  it('draws the bottom bar on phones and no bar beside the desktop sidebar', () => {
    const r = render(<TabLayout />)
    expect(renderTabBar().getByText('bottom-tab-bar')).toBeTruthy()

    mockBp = 'expanded'
    act(() => r.rerender(<TabLayout />))
    expect(renderTabBar().getByText('no-bar')).toBeTruthy()
  })

  it('turns edge-swipe navigation off beside the sidebar and on for phones', () => {
    const r = render(<TabLayout />)
    expect(mockSwipeEnabled).toBe(true)
    mockBp = 'expanded'
    r.rerender(<TabLayout />)
    expect(mockSwipeEnabled).toBe(false)
  })

  it('never shows the sidebar on native, whatever the width', () => {
    Platform.OS = 'android'
    mockBp = 'expanded'
    render(<TabLayout />)
    expect(screen.queryByTestId('sidebar-nav')).toBeNull()
    expect(renderTabBar().getByText('bottom-tab-bar')).toBeTruthy()
  })
})
