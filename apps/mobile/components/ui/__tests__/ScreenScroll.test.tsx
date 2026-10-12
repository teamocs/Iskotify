/**
 * ScreenScroll on wide web: content is centered in a column, and the caller's
 * contentContainerStyle (e.g. `gap`) must apply to that column — otherwise the
 * gap spaces only the single wrapper and every section touches (seen in the M1
 * tablet screenshots of Practice).
 */
import React from 'react'
import { Platform, Text, StyleSheet } from 'react-native'
import { render, screen } from '@testing-library/react-native'

const mockWidth = { value: 820 }
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: mockWidth.value, height: 1180, scale: 1, fontScale: 1 }),
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

import { ScreenScroll } from '../ScreenScroll'

describe('ScreenScroll', () => {
  const realOS = Platform.OS
  afterEach(() => { (Platform as { OS: string }).OS = realOS })

  it('on tablet web, centers a 720 column that carries the caller gap', () => {
    ;(Platform as { OS: string }).OS = 'web'
    mockWidth.value = 820
    render(<ScreenScroll contentContainerStyle={{ gap: 12 }}><Text>A</Text><Text>B</Text></ScreenScroll>)
    const column = screen.getByTestId('screen-scroll-column')
    const style = StyleSheet.flatten(column.props.style)
    expect(style.maxWidth).toBe(720)
    expect(style.gap).toBe(12)
  })

  it('on phones, keeps the style on the scroll content container (unchanged)', () => {
    ;(Platform as { OS: string }).OS = 'android'
    mockWidth.value = 390
    const { UNSAFE_getByType } = render(
      <ScreenScroll contentContainerStyle={{ gap: 12 }}><Text>A</Text></ScreenScroll>,
    )
    const { ScrollView } = require('react-native')
    const cc = StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle)
    expect(cc.gap).toBe(12)
    expect(cc.paddingHorizontal).toBe(16)
  })

  // iOS redesign P2c: the last row clears the floating capsule
  // (62 tall + 26 above the safe area + a 16 gap = layout.capsuleClearance).
  it('clears the floating capsule on phones: capsuleClearance + the safe area', () => {
    ;(Platform as { OS: string }).OS = 'android'
    mockWidth.value = 390
    const { UNSAFE_getByType } = render(<ScreenScroll><Text>A</Text></ScreenScroll>)
    const { ScrollView } = require('react-native')
    const { layout } = require('../../../theme/tokens')
    expect(layout.capsuleClearance).toBe(104)
    expect(StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(layout.capsuleClearance)
  })

  // iOS redesign P2b: native tabs inset the tab's first scroll view for the
  // system bar and the home indicator, so only the page gap is added.
  it('iOS tab screens add only the page gap (the system bar insets the scroll view)', () => {
    ;(Platform as { OS: string }).OS = 'ios'
    mockWidth.value = 390
    const { UNSAFE_getByType } = render(<ScreenScroll tabBarInset><Text>A</Text></ScreenScroll>)
    const { ScrollView } = require('react-native')
    const { spacing } = require('../../../theme/tokens')
    expect(StyleSheet.flatten(UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(spacing.xl)
  })

  it("composes a caller's onScroll with the bar feed instead of replacing it", () => {
    ;(Platform as { OS: string }).OS = 'android'
    mockWidth.value = 390
    const Reanimated = require('react-native-reanimated')
    const handler = jest.spyOn(Reanimated, 'useAnimatedScrollHandler')
    const callerOnScroll = jest.fn()
    const { UNSAFE_getByType } = render(<ScreenScroll onScroll={callerOnScroll}><Text>A</Text></ScreenScroll>)
    const { ScrollView } = require('react-native')
    // The scroll view gets the composed worklet handler, never the bare caller fn…
    expect(UNSAFE_getByType(ScrollView).props.onScroll).not.toBe(callerOnScroll)
    // …and the caller's function is in that handler's dependencies (it calls it).
    expect(handler.mock.calls.at(-1)?.[1]).toContain(callerOnScroll)
    handler.mockRestore()
  })

  it('needs no capsule clearance beside the desktop sidebar, or off the tabs', () => {
    ;(Platform as { OS: string }).OS = 'web'
    mockWidth.value = 1280
    const { ScrollView } = require('react-native')
    const r = render(<ScreenScroll><Text>A</Text></ScreenScroll>)
    expect(StyleSheet.flatten(r.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(20)
    r.unmount()
    ;(Platform as { OS: string }).OS = 'android'
    mockWidth.value = 390
    const r2 = render(<ScreenScroll tabBarInset={false}><Text>A</Text></ScreenScroll>)
    expect(StyleSheet.flatten(r2.UNSAFE_getByType(ScrollView).props.contentContainerStyle).paddingBottom).toBe(20)
  })
})
