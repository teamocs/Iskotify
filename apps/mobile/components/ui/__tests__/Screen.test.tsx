/**
 * <Screen> and <TwoColumn> — responsive layout primitives.
 * useWindowDimensions is driven per test to simulate phone / tablet / desktop.
 */
import React from 'react'
import { Platform, Text, StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { spacing } from '../../../theme/tokens'
import { firstScrollDescendant } from '../../../test-utils/firstScrollDescendant'

const mockWidth = { value: 390 }
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: mockWidth.value, height: 900, scale: 1, fontScale: 1 }),
}))

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native')
  return {
    SafeAreaView: ({ children, edges, style }: any) => <View testID="safe-area" style={style} {...{ edges }}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  }
})

import { Screen } from '../Screen'
import { TwoColumn } from '../TwoColumn'

const contentStyle = () => StyleSheet.flatten(screen.getByTestId('screen-content').props.style)

describe('Screen', () => {
  it('phone (390): 16pt gutter, full width', () => {
    mockWidth.value = 390
    render(<Screen><Text>Hi</Text></Screen>)
    expect(screen.getByText('Hi')).toBeTruthy()
    expect(contentStyle().paddingHorizontal).toBe(16)
  })

  it('tablet (820): 24pt gutter and a 720 reading measure', () => {
    mockWidth.value = 820
    render(<Screen><Text>Hi</Text></Screen>)
    const s = contentStyle()
    expect(s.paddingHorizontal).toBe(24)
    expect(s.maxWidth).toBe(720)
    expect(s.alignSelf).toBe('center')
  })

  it('desktop (1440): 32pt gutter; width="wide" allows 1040', () => {
    mockWidth.value = 1440
    render(<Screen width="wide"><Text>Hi</Text></Screen>)
    const s = contentStyle()
    expect(s.paddingHorizontal).toBe(32)
    expect(s.maxWidth).toBe(1040)
  })

  it('respects the top safe area by default', () => {
    render(<Screen><Text>Hi</Text></Screen>)
    expect(screen.getByTestId('safe-area').props.edges).toEqual(['top'])
  })

  it('renders a fixed header above the scrolling content', () => {
    render(<Screen header={<Text>Header</Text>}><Text>Body</Text></Screen>)
    expect(screen.getByText('Header')).toBeTruthy()
    expect(screen.getByText('Body')).toBeTruthy()
  })

  it('scrolls by default and keeps taps working with the keyboard open', () => {
    render(<Screen><Text>Hi</Text></Screen>)
    expect(screen.getByTestId('screen-scroll').props.keyboardShouldPersistTaps).toBe('handled')
  })

  it('can render a non-scrolling body (for screens that own a FlatList)', () => {
    render(<Screen scroll={false}><Text>List</Text></Screen>)
    expect(screen.queryByTestId('screen-scroll')).toBeNull()
    expect(screen.getByText('List')).toBeTruthy()
  })
})

describe('TwoColumn', () => {
  it('stacks on compact and medium', () => {
    mockWidth.value = 820
    render(<TwoColumn primary={<Text>Main</Text>} secondary={<Text>Side</Text>} />)
    expect(StyleSheet.flatten(screen.getByTestId('two-column').props.style).flexDirection).toBe('column')
  })

  it('sits side by side on expanded', () => {
    mockWidth.value = 1440
    render(<TwoColumn primary={<Text>Main</Text>} secondary={<Text>Side</Text>} />)
    expect(StyleSheet.flatten(screen.getByTestId('two-column').props.style).flexDirection).toBe('row')
    expect(screen.getByText('Main')).toBeTruthy()
    expect(screen.getByText('Side')).toBeTruthy()
  })
})

// iOS redesign P2c: tab screens clear the floating capsule, and a large-title
// header can scroll with the content.
describe('Screen with the floating tab bar', () => {
  const scrollStyle = () => {
    const { ScrollView } = require('react-native')
    return StyleSheet.flatten(screen.UNSAFE_getByType(ScrollView).props.contentContainerStyle)
  }

  const realOS = Platform.OS
  afterEach(() => { Platform.OS = realOS })

  it('reserves capsuleClearance + the safe area under tab screens (Android, web)', () => {
    Platform.OS = 'android'
    mockWidth.value = 390
    render(<Screen tabBarInset><Text>Hi</Text></Screen>)
    // useSafeInsets reports a 0 bottom inset under this mock.
    expect(scrollStyle().paddingBottom).toBe(104)
  })

  it('iOS: native tabs inset the scroll view for their own bar, so only the page gap', () => {
    Platform.OS = 'ios'
    mockWidth.value = 390
    render(<Screen tabBarInset><Text>Hi</Text></Screen>)
    expect(scrollStyle().paddingBottom).toBe(spacing.xl)
  })

  it('off the tabs, only the safe area and the page gap', () => {
    mockWidth.value = 390
    render(<Screen><Text>Hi</Text></Screen>)
    expect(scrollStyle().paddingBottom).toBe(20)
  })

  it('headerScrolls puts the header inside the scroll view; otherwise it stays fixed above it', () => {
    mockWidth.value = 390
    const r = render(<Screen header={<Text>Head</Text>} headerScrolls><Text>Body</Text></Screen>)
    const { ScrollView } = require('react-native')
    expect(r.UNSAFE_getByType(ScrollView).findAll((n: any) => n.props.children === 'Head')).not.toHaveLength(0)
    r.unmount()
    const r2 = render(<Screen header={<Text>Head</Text>}><Text>Body</Text></Screen>)
    expect(r2.UNSAFE_getByType(ScrollView).findAll((n: any) => n.props.children === 'Head')).toHaveLength(0)
  })
})

// iOS redesign P2b: native tabs minimize the bar for (and inset) only the
// scroll view in each tab screen's first-descendant chain.
describe('Screen: the scroll view is the first descendant on iOS', () => {
  const realOS = Platform.OS
  beforeEach(() => { Platform.OS = 'ios'; mockWidth.value = 390 })
  afterEach(() => { Platform.OS = realOS })

  it('without a header (Today)', () => {
    const r = render(<Screen tabBarInset><Text>Body</Text></Screen>)
    expect(firstScrollDescendant(r.UNSAFE_root)?.props.testID).toBe('screen-scroll')
  })

  it('with a header that scrolls (Practice, Search)', () => {
    const r = render(<Screen tabBarInset headerScrolls header={<Text>Head</Text>}><Text>Body</Text></Screen>)
    expect(firstScrollDescendant(r.UNSAFE_root)?.props.testID).toBe('screen-scroll')
  })

  it("with the body's own scroll view (Progress)", () => {
    const { ScrollView } = require('react-native')
    const r = render(<Screen scroll={false}><ScrollView testID="own-scroll"><Text>Body</Text></ScrollView></Screen>)
    expect(firstScrollDescendant(r.UNSAFE_root)?.props.testID).toBe('own-scroll')
  })

  it('a fixed header ahead of the scroll view breaks the chain (what Explore avoids)', () => {
    const r = render(<Screen header={<Text>Head</Text>}><Text>Body</Text></Screen>)
    expect(firstScrollDescendant(r.UNSAFE_root)).toBeNull()
  })
})
