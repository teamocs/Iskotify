/**
 * Large-title header (iOS redesign P2c): a 34/41 bold title that scrolls with
 * the content, and an inline 17pt title on a glass band that stays hidden
 * from assistive tech until the large title has scrolled away.
 */
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { CollapsedTitleBand, LargeTitleBandHost, LargeTitleHeader, isTitleCollapsed, SOFT_EDGE } from '../LargeTitleHeader'

const mockCaps = { liquidGlass: false, blurTier: 'opaque', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({ usePlatformCapabilities: () => mockCaps }))

const sv = (value: number) => ({ value }) as any

describe('LargeTitleHeader', () => {
  it('draws a 34/41 bold title as the heading', () => {
    render(<LargeTitleHeader title="Practice" subtitle="Mocks, drills and review" />)
    const title = screen.getByRole('header', { name: 'Practice' })
    const style = StyleSheet.flatten(title.props.style)
    expect(style).toMatchObject({ fontSize: 34, lineHeight: 41, fontWeight: '700' })
    expect(title.props.maxFontSizeMultiplier).toBe(1.3)
    expect(screen.getByText('Mocks, drills and review')).toBeTruthy()
  })

  it('renders a custom heading in place of the title text', () => {
    render(<LargeTitleHeader title="Today"><Text>Good morning, Ana</Text></LargeTitleHeader>)
    expect(screen.getByText('Good morning, Ana')).toBeTruthy()
    expect(screen.queryByRole('header', { name: 'Today' })).toBeNull()
  })

  it('collapses once the title has scrolled under the band', () => {
    expect(isTitleCollapsed(0, 60)).toBe(false)
    expect(isTitleCollapsed(59, 60)).toBe(false)
    expect(isTitleCollapsed(60, 60)).toBe(true)
    expect(isTitleCollapsed(100, 0)).toBe(false) // not measured yet
  })

  it('registers with the band host after layout: the band names the screen', () => {
    render(
      <LargeTitleBandHost scrollY={sv(0)}>
        <LargeTitleHeader title="Search" />
      </LargeTitleBandHost>,
    )
    expect(screen.queryByTestId('large-title-band')).toBeNull()
    fireEvent(screen.getByTestId('large-title-header'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } } })
    expect(screen.getByTestId('large-title-inline', { includeHiddenElements: true }).props.children).toBe('Search')
  })
})

describe('CollapsedTitleBand', () => {
  it('is hidden from accessibility until collapsed', () => {
    render(<CollapsedTitleBand title="Practice" collapseAt={60} scrollY={sv(0)} />)
    // What assistive tech sees: the default queries do not find it.
    expect(screen.queryByTestId('large-title-band')).toBeNull()
    expect(screen.queryByText('Practice')).toBeNull()
    const band = screen.getByTestId('large-title-band', { includeHiddenElements: true })
    expect(band.props.accessibilityElementsHidden).toBe(true)
    expect(band.props.importantForAccessibility).toBe('no-hide-descendants')
    expect(band.props['aria-hidden']).toBe(true)
    expect(band.props.pointerEvents).toBe('none')
  })

  it('is exposed once collapsed', () => {
    render(<CollapsedTitleBand title="Practice" collapseAt={60} scrollY={sv(200)} />)
    const band = screen.getByTestId('large-title-band')
    expect(band.props.accessibilityElementsHidden).toBe(false)
    expect(band.props.importantForAccessibility).toBe('auto')
    expect(band.props['aria-hidden']).toBe(false)
    expect(screen.getByText('Practice')).toBeTruthy()
  })

  it('inline title is 17pt semibold, capped at 1.3x, over a 24pt soft edge', () => {
    render(<CollapsedTitleBand title="Practice" collapseAt={60} scrollY={sv(200)} />)
    const inline = screen.getByTestId('large-title-inline')
    expect(StyleSheet.flatten(inline.props.style)).toMatchObject({ fontSize: 17, fontWeight: '600' })
    expect(inline.props.maxFontSizeMultiplier).toBe(1.3)
    expect(SOFT_EDGE).toBe(24)
  })
})
