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
})
