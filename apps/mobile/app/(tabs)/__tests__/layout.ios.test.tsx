/**
 * The iOS tab layout (app/(tabs)/_layout.ios.tsx, iOS redesign P2b): native
 * tabs draw the system bar (Liquid Glass on iOS 26, the classic bar on 18),
 * minimize it on scroll, and give Search the system search role. The
 * floating bar, its scroll provider, the Android blur targets and the
 * edge-swipe navigator are not part of it.
 */
import React from 'react'
import { Platform } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'

type Props = Record<string, unknown> & { children?: React.ReactNode }
const mockCalls: { tabs: Props | null; triggers: Props[]; icons: Props[]; labels: string[] } = {
  tabs: null, triggers: [], icons: [], labels: [],
}
let mockSwipeRendered = false
let mockScrollProviderRendered = false

jest.mock('expo-router/unstable-native-tabs', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  function Icon(props: Props) { mockCalls.icons.push(props); return null }
  function Label({ children }: Props) { mockCalls.labels.push(String(children)); return React.createElement(Text, null, children) }
  function Trigger(props: Props) {
    mockCalls.triggers.push(props)
    return React.createElement(View, { testID: `trigger-${String(props.name)}` }, props.children)
  }
  Trigger.Icon = Icon
  Trigger.Label = Label
  function NativeTabs(props: Props) {
    mockCalls.tabs = props
    return React.createElement(View, { testID: 'native-tabs' }, props.children)
  }
  NativeTabs.Trigger = Trigger
  return { NativeTabs }
})

const mockDb = { tag: 'db' }
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDb }))
const mockSyncOnLaunch = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../services/sync', () => ({ syncOnLaunch: (...a: unknown[]) => mockSyncOnLaunch(...a) }))
jest.mock('../../../components/SyncErrorBanner', () => ({
  SyncErrorBanner: ({ onRetry }: { onRetry: () => void }) => {
    const { Pressable, Text } = require('react-native')
    return require('react').createElement(Pressable, { testID: 'sync-banner', onPress: onRetry },
      require('react').createElement(Text, null, 'banner'))
  },
}))
jest.mock('../../../components/navigation/FloatingTabBar', () => ({
  FloatingTabBar: () => require('react').createElement(require('react-native').Text, null, 'bottom-tab-bar'),
}))
jest.mock('../../../components/EdgeSwipeNavigator', () => ({
  EdgeSwipeNavigator: ({ children }: { children: React.ReactNode }) => { mockSwipeRendered = true; return children },
}))
jest.mock('../../../components/navigation/TabBarScrollContext', () => ({
  ...jest.requireActual('../../../components/navigation/TabBarScrollContext'),
  TabBarScrollProvider: ({ children }: { children: React.ReactNode }) => { mockScrollProviderRendered = true; return children },
}))

const TabLayout: React.ComponentType = require('../_layout.ios.tsx').default

const originalOS = Platform.OS
beforeEach(() => {
  Platform.OS = 'ios'
  mockCalls.tabs = null
  mockCalls.triggers = []
  mockCalls.icons = []
  mockCalls.labels = []
  mockSwipeRendered = false
  mockScrollProviderRendered = false
  mockSyncOnLaunch.mockClear()
})
afterAll(() => { Platform.OS = originalOS })

const names = () => mockCalls.triggers.map(t => t.name)

describe('iOS tab layout (native tabs)', () => {
  it('draws Today, Practice, Explore, Progress, then Search, in that order', () => {
    render(<TabLayout />)
    expect(names()).toEqual(['index', 'practice', 'explore', 'progress', 'search'])
    expect(mockCalls.labels).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
  })

  it('gives Search the system search role, last', () => {
    render(<TabLayout />)
    const last = mockCalls.triggers[mockCalls.triggers.length - 1]
    expect(last).toMatchObject({ name: 'search', role: 'search' })
    expect(mockCalls.triggers.filter(t => t.role === 'search')).toHaveLength(1)
  })

  it('uses SF Symbols: house (filled when selected), clipboard, globe, chart', () => {
    render(<TabLayout />)
    expect(mockCalls.icons.map(i => i.sf)).toEqual([
      { default: 'house', selected: 'house.fill' },
      'pencil.and.list.clipboard',
      'globe',
      'chart.line.uptrend.xyaxis',
    ])
  })

  it('minimizes the bar on scroll down and tints it with the accent', () => {
    render(<TabLayout />)
    expect(mockCalls.tabs).toMatchObject({ minimizeBehavior: 'onScrollDown', tintColor: '#800000' })
  })

  it('has no trigger for a legacy route (profile, listings, updates, analytics)', () => {
    render(<TabLayout />)
    for (const legacy of ['profile', 'listings', 'updates', 'analytics']) {
      expect(names()).not.toContain(legacy)
    }
  })

  it('shows the sync-error banner, whose retry re-runs the launch sync', () => {
    render(<TabLayout />)
    fireEvent.press(screen.getByTestId('sync-banner'))
    expect(mockSyncOnLaunch).toHaveBeenCalledWith(mockDb)
  })

  it('leaves out the floating bar, its scroll provider and edge-swipe navigation', () => {
    render(<TabLayout />)
    expect(screen.getByTestId('native-tabs')).toBeTruthy()
    expect(screen.queryByText('bottom-tab-bar')).toBeNull()
    expect(mockScrollProviderRendered).toBe(false)
    expect(mockSwipeRendered).toBe(false)
  })
})

// The native-tabs API is unstable: one file uses it, and the version is exact.
describe('native tabs containment', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const root = path.join(__dirname, '..', '..', '..')

  it('only app/(tabs)/_layout.ios.tsx imports expo-router/unstable-native-tabs', () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '__tests__' || e.name.startsWith('.') || e.name === 'dist') continue
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.tsx?$/.test(e.name) && fs.readFileSync(full, 'utf8').includes('expo-router/unstable-native-tabs')) {
          hits.push(path.relative(root, full).split(path.sep).join('/'))
        }
      }
    }
    for (const d of ['app', 'components', 'hooks', 'services', 'lib', 'utils']) {
      if (fs.existsSync(path.join(root, d))) walk(path.join(root, d))
    }
    expect(hits).toEqual(['app/(tabs)/_layout.ios.tsx'])
  })

  it('expo-router is pinned to an exact version', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
    expect(pkg.dependencies['expo-router']).toMatch(/^\d+\.\d+\.\d+$/)
  })
})

