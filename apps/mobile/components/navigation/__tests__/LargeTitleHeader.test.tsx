/**
 * Large-title header (iOS redesign P2c): a 34/41 bold title that scrolls with
 * the content, and an inline 17pt title on a glass band that stays hidden
 * from assistive tech until the large title has scrolled away.
 */
import React from 'react'
import { StyleSheet, Text } from 'react-native'
import { fireEvent, render, screen } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import {
  CollapsedTitleBand, LargeTitleBandHost, LargeTitleHeader, isTitleCollapsed, collapseOffset, useBandScrollY, SOFT_EDGE,
} from '../LargeTitleHeader'

const mockCaps = { liquidGlass: false, blurTier: 'opaque', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({ usePlatformCapabilities: () => mockCaps }))

const sv = (value: number) => ({ value }) as any

// The library mock's useAnimatedReaction never runs; run it once after
// render, as the UI thread would on the first frame. (The band itself no
// longer reads scrollY.value during render.)
beforeEach(() => {
  jest.restoreAllMocks()
  jest.spyOn(Reanimated, 'useAnimatedReaction').mockImplementation(((prepare: () => unknown, react: (a: unknown, b: unknown) => void) => {
    React.useEffect(() => { react(prepare(), null) })
  }) as never)
})

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

  // P4: under a fixed top bar (Notes, Labels, Archive, Trash) the band would
  // cover the back button, so those titles opt out of collapsing.
  it('collapses={false} never registers a band', () => {
    render(
      <LargeTitleBandHost scrollY={sv(0)}>
        <LargeTitleHeader title="Archive" collapses={false} />
      </LargeTitleBandHost>,
    )
    fireEvent(screen.getByTestId('large-title-header'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } } })
    expect(screen.queryByTestId('large-title-band', { includeHiddenElements: true })).toBeNull()
    expect(screen.getByRole('header', { name: 'Archive' })).toBeTruthy()
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

  it('once revealed, the inline title is the heading', () => {
    render(<CollapsedTitleBand title="Practice" collapseAt={60} scrollY={sv(200)} />)
    expect(screen.getByRole('header', { name: 'Practice' })).toBeTruthy()
  })

  it('pads by the top safe-area inset, so the title sits below the status bar', () => {
    render(<CollapsedTitleBand title="Practice" collapseAt={60} scrollY={sv(200)} topInset={47} />)
    const glass = StyleSheet.flatten(screen.getByTestId('large-title-glass').props.style)
    expect(glass.paddingTop).toBe(47)
    expect(glass.minHeight).toBe(44 + 47)
  })

  it('the host passes its inset to the band, and collapseAt is in scroll-view terms', () => {
    render(
      <LargeTitleBandHost scrollY={sv(200)} topInset={47}>
        <LargeTitleHeader title="Search" />
      </LargeTitleBandHost>,
    )
    fireEvent(screen.getByTestId('large-title-header'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } } })
    expect(StyleSheet.flatten(screen.getByTestId('large-title-glass').props.style).paddingTop).toBe(47)
    // The scroll view starts below the inset: only the 44pt row counts.
    expect(collapseOffset(80)).toBe(36)
    // Web: a 12pt spacer sits between the safe area and the scroll view.
    expect(collapseOffset(80, 12)).toBe(48)
  })

  it('exposes the host scrollY for screens that own their scroll view (Progress)', () => {
    const y = sv(0)
    let seen: unknown
    const Probe = () => { seen = useBandScrollY(); return null }
    render(<LargeTitleBandHost scrollY={y}><Probe /></LargeTitleBandHost>)
    expect(seen).toBe(y)
  })
})
