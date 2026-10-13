/**
 * The floating glass tab bar (iOS redesign P2c): four tabs in a capsule plus a
 * search circle; a spring lens; minimize on scroll; the search morph; haptics
 * on change only; Reduce Motion; and the tab semantics screen readers need.
 */
import React, { createRef, useImperativeHandle, forwardRef } from 'react'
import { StyleSheet } from 'react-native'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as Reanimated from 'react-native-reanimated'
import { lightTheme, motion } from '../../../theme/tokens'
import { aria } from '../../../test-utils/aria'
import { FloatingTabBar, barMode, barWidths, keyboardOpenedOffset, lensFrame, CAPSULE_MAX_WIDTH } from '../FloatingTabBar'
import {
  TabBarScrollProvider, useTabBarScroll, nextMinimized, scrollFlip, MINIMIZE_AFTER, EXPAND_NEAR_TOP, type ScrollSample,
} from '../TabBarScrollContext'
import { __resetSearchQueryForTests, setSearchQuery } from '../../search/searchQuery'

jest.mock('../../../hooks/useSafeInsets', () => ({ useSafeInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) }))
const mockCaps = { liquidGlass: false, blurTier: 'opaque', reduceTransparency: false, reduceMotion: false }
jest.mock('../../../hooks/usePlatformCapabilities', () => ({ usePlatformCapabilities: () => mockCaps }))
const mockSelection = jest.fn()
jest.mock('../../../lib/haptics', () => ({ selection: () => mockSelection() }))

const ROUTES = ['index', 'practice', 'explore', 'progress', 'search', 'updates']

function makeProps(activeName: string, opts: { prevented?: boolean } = {}) {
  const routes = ROUTES.map(name => ({ key: `${name}-key`, name }))
  return {
    state: { index: ROUTES.indexOf(activeName), routes },
    navigation: {
      emit: jest.fn(() => ({ defaultPrevented: !!opts.prevented })),
      navigate: jest.fn(),
    },
    descriptors: {},
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as any
}

type Ctx = NonNullable<ReturnType<typeof useTabBarScroll>>
const Grab = forwardRef<Ctx | null>((_p, ref) => {
  const ctx = useTabBarScroll()
  useImperativeHandle(ref, () => ctx as Ctx, [ctx])
  return null
})
Grab.displayName = 'Grab'

function renderBar(props: ReturnType<typeof makeProps>) {
  const ctx = createRef<Ctx | null>()
  const ui = (p: ReturnType<typeof makeProps>) => (
    <TabBarScrollProvider>
      <Grab ref={ctx} />
      <FloatingTabBar {...p} />
    </TabBarScrollProvider>
  )
  const r = render(ui(props))
  return { ...r, ctx, rerenderWith: (p: ReturnType<typeof makeProps>) => r.rerender(ui(p)) }
}

beforeEach(() => {
  mockSelection.mockClear()
  mockCaps.reduceMotion = false
  __resetSearchQueryForTests()
  jest.restoreAllMocks()
  // Like the real hook: one shared value per component for its lifetime (the
  // library mock returns a fresh object each render, which would hide
  // re-render bugs such as a context value that never changes).
  jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(((init: unknown) =>
    React.useRef({ value: init }).current) as never)
})

describe('FloatingTabBar: structure and roles', () => {
  it('draws four tabs in a tablist and a separate Search button', () => {
    renderBar(makeProps('index'))
    expect(screen.getByTestId('tab-bar-tablist').props.accessibilityRole).toBe('tablist')
    expect(screen.getAllByRole('tab').map(t => t.props.accessibilityLabel)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
  })

  it('marks the focused tab aria-selected, and the owner of a legacy route', () => {
    const { rerenderWith } = renderBar(makeProps('practice'))
    expect(aria(screen.getByRole('tab', { name: 'Practice' }), 'aria-selected')).toBe(true)
    expect(aria(screen.getByRole('tab', { name: 'Today' }), 'aria-selected')).toBe(false)
    rerenderWith(makeProps('updates'))
    expect(aria(screen.getByRole('tab', { name: 'Explore' }), 'aria-selected')).toBe(true)
  })

  it('floats 26pt above the safe area, 16pt from each side', () => {
    renderBar(makeProps('index'))
    const shell = StyleSheet.flatten(screen.getByTestId('floating-tab-bar').props.style)
    expect(shell).toMatchObject({ position: 'absolute', bottom: 26 + 20, paddingHorizontal: 16 })
  })

  it('caps the capsule at 560 on the web (with the 12pt gap and the 62pt circle)', () => {
    expect(CAPSULE_MAX_WIDTH).toBe(560)
    expect(barWidths('tabs', 1000)).toEqual({ capsule: 1000 - 62 - 12, search: 62 })
  })

  it('labels: 12pt, capped at 1.3x, and tabs use minHeight (not height)', () => {
    renderBar(makeProps('index'))
    const label = screen.getByText('Today')
    expect(StyleSheet.flatten(label.props.style).fontSize).toBeGreaterThanOrEqual(12)
    expect(label.props.maxFontSizeMultiplier).toBe(1.3)
    for (const tab of screen.getAllByRole('tab')) {
      const fn = tab.props.style
      const flat = StyleSheet.flatten(typeof fn === 'function' ? fn({ pressed: false }) : fn)
      expect(flat.height).toBeUndefined()
      expect(flat.minHeight).toBeGreaterThanOrEqual(44)
    }
  })

  it('active label is the maroon accent, the rest textPrimary', () => {
    renderBar(makeProps('explore'))
    expect(StyleSheet.flatten(screen.getByText('Explore').props.style).color).toBe(lightTheme.accentText)
    expect(StyleSheet.flatten(screen.getByText('Today').props.style).color).toBe(lightTheme.textPrimary)
  })

  it('draws a keyboard focus ring with the focusRing token', () => {
    renderBar(makeProps('index'))
    const p = screen.UNSAFE_root.findAll((n: any) => typeof n.type !== 'string' && typeof n.props.style === 'function' && n.props.accessibilityLabel === 'Practice')[0]!
    const ring = StyleSheet.flatten(p.props.style({ pressed: false, focused: true }))
    expect(ring.outlineColor).toBe(lightTheme.focusRing)
    expect(ring.outlineWidth).toBeGreaterThanOrEqual(2)
    expect(StyleSheet.flatten(p.props.style({ pressed: false, focused: false })).outlineWidth ?? 0).toBe(0)
  })
})

describe('FloatingTabBar: presses', () => {
  it('emits tabPress and navigates to an unfocused tab, with one haptic tick', () => {
    const props = makeProps('index')
    renderBar(props)
    fireEvent.press(screen.getByRole('tab', { name: 'Progress' }))
    expect(props.navigation.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'progress-key', canPreventDefault: true }))
    expect(props.navigation.navigate).toHaveBeenCalledWith('progress')
    expect(mockSelection).toHaveBeenCalledTimes(1)
  })

  it('respects defaultPrevented: no navigation and no haptic', () => {
    const props = makeProps('index', { prevented: true })
    renderBar(props)
    fireEvent.press(screen.getByRole('tab', { name: 'Practice' }))
    expect(props.navigation.emit).toHaveBeenCalled()
    expect(props.navigation.navigate).not.toHaveBeenCalled()
    expect(mockSelection).not.toHaveBeenCalled()
  })

  it('re-pressing the focused tab emits tabPress (scroll to top) without navigating or a haptic', () => {
    const props = makeProps('practice')
    renderBar(props)
    fireEvent.press(screen.getByRole('tab', { name: 'Practice' }))
    expect(props.navigation.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'practice-key' }))
    expect(props.navigation.navigate).not.toHaveBeenCalled()
    expect(mockSelection).not.toHaveBeenCalled()
  })

  it('the search circle goes to the Search tab', () => {
    const props = makeProps('explore')
    renderBar(props)
    fireEvent.press(screen.getByRole('button', { name: 'Search' }))
    expect(props.navigation.navigate).toHaveBeenCalledWith('search')
    expect(mockSelection).toHaveBeenCalledTimes(1)
  })
})

describe('FloatingTabBar: minimize on scroll', () => {
  const sample = (over: Partial<ScrollSample>): ScrollSample => ({
    y: 400, dy: 8, contentHeight: 2000, viewportHeight: 800, focused: true, ...over,
  })

  it('scroll rule: down past 140 minimizes; up, or near the top, expands', () => {
    expect(nextMinimized(false, MINIMIZE_AFTER + 10, 8)).toBe(true)
    expect(nextMinimized(false, MINIMIZE_AFTER - 10, 8)).toBe(false)
    expect(nextMinimized(true, 400, -8)).toBe(false)
    expect(nextMinimized(true, EXPAND_NEAR_TOP - 1, 8)).toBe(false)
    expect(nextMinimized(true, 400, 1)).toBe(true) // jitter keeps the state
  })

  it('a screen that is not focused never moves the bar (no stale flip)', () => {
    expect(scrollFlip(false, sample({ focused: false }))).toBe(false)
    expect(scrollFlip(true, sample({ dy: -20, focused: false }))).toBe(true)
    expect(scrollFlip(false, sample({}))).toBe(true)
  })

  it('the rubber-band back from overscrolling the bottom is not "scrolling up"', () => {
    // maxY = 2000 - 800 = 1200; y 1230 is past the end, bouncing back.
    expect(scrollFlip(true, sample({ y: 1230, dy: -10 }))).toBe(true)
    // A real scroll up inside the content still expands.
    expect(scrollFlip(true, sample({ y: 1100, dy: -10 }))).toBe(false)
  })

  it('minimized: one real button naming the selected tab; tapping it expands', () => {
    const { ctx } = renderBar(makeProps('practice'))
    act(() => ctx.current!.setMinimized(true))
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    const pill = screen.getByRole('button', { name: 'Show tab bar, Practice selected' })
    fireEvent.press(pill)
    expect(screen.getAllByRole('tab')).toHaveLength(4)
    expect(barMode('practice', true)).toBe('minimized')
    expect(barWidths('minimized', 400).capsule).toBe(62)
  })

  it('a tab change expands the bar again', () => {
    const { ctx, rerenderWith } = renderBar(makeProps('practice'))
    act(() => ctx.current!.setMinimized(true))
    rerenderWith(makeProps('explore'))
    expect(screen.getAllByRole('tab')).toHaveLength(4)
  })
})

describe('FloatingTabBar: search morph', () => {
  it('on Search, the capsule becomes "Back to {tab}" and the circle a search field', () => {
    const { rerenderWith } = renderBar(makeProps('practice'))
    const props = makeProps('search')
    rerenderWith(props)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    const back = screen.getByRole('button', { name: 'Back to Practice' })
    expect(screen.getByTestId('tab-bar-search-field').props.accessibilityLabel).toBe('Search schools, scholarships and exams')
    expect(barWidths('search', 400)).toEqual({ capsule: 62, search: 400 - 62 - 12 })
    fireEvent.press(back)
    expect(props.navigation.navigate).toHaveBeenCalledWith('practice')
  })

  it('the bottom field shares the Search screen query', () => {
    renderBar(makeProps('search'))
    act(() => setSearchQuery('upcat'))
    expect(screen.getByTestId('tab-bar-search-field').props.value).toBe('upcat')
    fireEvent.changeText(screen.getByTestId('tab-bar-search-field'), 'dost')
    expect(screen.getByTestId('tab-bar-search-field').props.value).toBe('dost')
    fireEvent.press(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByTestId('tab-bar-search-field').props.value).toBe('')
  })

  it('rides the keyboard with an 8pt gap whatever the nav-bar inset', () => {
    // Rest offset 26 + inset is cancelled, less the gap, for 3-button (48)
    // and gesture (24) navigation alike.
    expect(keyboardOpenedOffset(48)).toBe(26 + 48 - 8)
    expect(keyboardOpenedOffset(24)).toBe(26 + 24 - 8)
    expect(keyboardOpenedOffset(0)).toBe(18)
  })
})

describe('FloatingTabBar: lens and motion', () => {
  const layoutRow = (width = 400) =>
    fireEvent(screen.getByTestId('tab-bar-row'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height: 62 } } })

  it('places the lens arithmetically from the capsule width (no per-tab layout)', () => {
    // capsule 400 - 62 - 12 = 326; inner 326 - 8 = 318; each tab 79.5.
    expect(lensFrame(0, 326)).toEqual({ x: 4, width: 79.5 })
    expect(lensFrame(2, 326)).toEqual({ x: 4 + 2 * 79.5, width: 79.5 })
    expect(lensFrame(1, 0).width).toBe(0)
  })

  it('lays the tablist out at the expanded width (clipped while the capsule morphs)', () => {
    const { ctx } = renderBar(makeProps('index'))
    layoutRow()
    act(() => ctx.current!.setMinimized(true))
    act(() => ctx.current!.setMinimized(false))
    expect(StyleSheet.flatten(screen.getByTestId('tab-bar-tablist').props.style).width).toBe(326)
  })

  // Owner feedback (2026-10-13): no sideways bounce, shorter morphs.
  it('slides the lens on snappy (never bouncy) and morphs over a 260ms ease-out with a 140ms crossfade', () => {
    const spring = jest.spyOn(Reanimated, 'withSpring')
    const timing = jest.spyOn(Reanimated, 'withTiming')
    const { ctx, rerenderWith } = renderBar(makeProps('index'))
    layoutRow()
    rerenderWith(makeProps('explore'))
    expect(spring).toHaveBeenCalledWith(2, motion.spring.snappy)
    expect(spring).not.toHaveBeenCalledWith(expect.anything(), motion.spring.bouncy)
    spring.mockClear()
    timing.mockClear()
    act(() => ctx.current!.setMinimized(true))
    // The capsule shrinks to the 62pt pill; the search circle stays 62.
    expect(timing).toHaveBeenCalledWith(62, expect.objectContaining({ duration: motion.duration.bar }))
    expect(timing).toHaveBeenCalledWith(1, { duration: motion.duration.fade })
    expect(spring).not.toHaveBeenCalled()
    timing.mockClear()
    act(() => ctx.current!.setMinimized(false))
    expect(timing).toHaveBeenCalledWith(326, expect.objectContaining({ duration: 260 }))
  })

  it('Reduce Motion: the lens jumps and the morph is a 120ms crossfade', () => {
    mockCaps.reduceMotion = true
    const spring = jest.spyOn(Reanimated, 'withSpring')
    const timing = jest.spyOn(Reanimated, 'withTiming')
    const { ctx, rerenderWith } = renderBar(makeProps('index'))
    layoutRow()
    rerenderWith(makeProps('explore'))
    act(() => ctx.current!.setMinimized(true))
    expect(spring).not.toHaveBeenCalled()
    expect(timing).toHaveBeenCalledWith(1, { duration: 120 })
  })
})

describe('FloatingTabBar: Android glass', () => {
  it("re-renders with the focused scene's BlurTargetView ref when the scene registers after the bar", () => {
    const target = { current: null }
    const { ctx } = renderBar(makeProps('search'))
    const glassNow = () => screen.UNSAFE_root.findAll((n: any) => n.props.testID === 'tab-bar-capsule' && 'blurTarget' in n.props)[0]!
    expect(glassNow().props.blurTarget).toBeUndefined()
    act(() => ctx.current!.registerBlurTarget('search-key', target))
    expect(glassNow().props.blurTarget).toBe(target)
    act(() => ctx.current!.registerBlurTarget('search-key', null))
    expect(glassNow().props.blurTarget).toBeUndefined()
  })
})
