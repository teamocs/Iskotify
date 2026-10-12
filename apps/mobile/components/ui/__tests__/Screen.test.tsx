/**
 * <Screen> and <TwoColumn> — responsive layout primitives.
 * useWindowDimensions is driven per test to simulate phone / tablet / desktop.
 */
import React from 'react'
import { Text, StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'

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

  it('reserves capsuleClearance + the safe area under tab screens', () => {
    mockWidth.value = 390
    render(<Screen tabBarInset><Text>Hi</Text></Screen>)
    // useSafeInsets reports a 0 bottom inset under this mock.
    expect(scrollStyle().paddingBottom).toBe(104)
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
