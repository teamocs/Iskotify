/**
 * The floating bar's scroll feed without its provider (iOS redesign P2b):
 * on iOS the native tabs draw the system bar and the layout renders no
 * TabBarScrollProvider, so every hook a screen calls must be a harmless
 * no-op there. Also: re-pressing a tab scrolls its screen to the top when
 * the screen sits one stack deep inside the tab (Search).
 */
import React from 'react'
import { Platform, Text } from 'react-native'
import { act, render, renderHook, screen } from '@testing-library/react-native'
import { NavigationContext } from '@react-navigation/native'
import {
  useScrollToTopOnReselect, useTabBarScroll, useTabBarScrollHandler,
} from '../TabBarScrollContext'
import { SceneBlurTarget } from '../SceneBlurTarget'

const originalOS = Platform.OS
afterEach(() => { Platform.OS = originalOS })

describe('without a TabBarScrollProvider (iOS native tabs)', () => {
  it('useTabBarScroll is null', () => {
    const { result } = renderHook(() => useTabBarScroll())
    expect(result.current).toBeNull()
  })

  it('useTabBarScrollHandler still returns a scroll handler', () => {
    const { result } = renderHook(() => useTabBarScrollHandler())
    expect(result.current).toBeTruthy()
  })

  it('SceneBlurTarget passes the scene through on iOS', () => {
    Platform.OS = 'ios'
    const { UNSAFE_root } = render(<SceneBlurTarget routeKey="k"><Text>scene</Text></SceneBlurTarget>)
    expect(screen.getByText('scene')).toBeTruthy()
    expect(UNSAFE_root.findAll((n: { type?: { displayName?: string } }) => n.type?.displayName === 'BlurTargetView')).toHaveLength(0)
  })

  it('SceneBlurTarget on Android renders without a provider to register with', () => {
    Platform.OS = 'android'
    setVersion(31)
    render(<SceneBlurTarget routeKey="k"><Text>scene</Text></SceneBlurTarget>)
    expect(screen.getByText('scene')).toBeTruthy()
  })
})

// Android blurs only on API 31+, so the BlurTargetView is mounted only there;
// older Android gets the scene as it is (the bar falls back to opaque).
const versionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version')
function setVersion(v: number) {
  Object.defineProperty(Platform, 'Version', { value: v, configurable: true, writable: true })
}
afterEach(() => {
  if (versionDescriptor) Object.defineProperty(Platform, 'Version', versionDescriptor)
})

describe('SceneBlurTarget on Android by API level', () => {
  const blurTargets = (root: { findAll: (p: (n: { type?: { displayName?: string } }) => boolean) => unknown[] }) =>
    root.findAll(n => n.type?.displayName === 'BlurTargetView')

  it.each([31, 34])('mounts a BlurTargetView on API %i', v => {
    Platform.OS = 'android'
    setVersion(v)
    const { UNSAFE_root } = render(<SceneBlurTarget routeKey="k"><Text>scene</Text></SceneBlurTarget>)
    expect(screen.getByText('scene')).toBeTruthy()
    expect(blurTargets(UNSAFE_root)).toHaveLength(1)
  })

  it.each([26, 30])('passes the scene through on API %i (no blur there)', v => {
    Platform.OS = 'android'
    setVersion(v)
    const { UNSAFE_root } = render(<SceneBlurTarget routeKey="k"><Text>scene</Text></SceneBlurTarget>)
    expect(screen.getByText('scene')).toBeTruthy()
    expect(blurTargets(UNSAFE_root)).toHaveLength(0)
  })
})

type Listener = (ev: { defaultPrevented?: boolean }) => void
function fakeNav(type: string, opts: { index?: number; parent?: ReturnType<typeof fakeNav> } = {}) {
  const listeners: Record<string, Listener[]> = {}
  return {
    listeners,
    getState: () => ({ type, index: opts.index ?? 0 }),
    getParent: () => opts.parent,
    isFocused: () => true,
    addListener: jest.fn((e: string, cb: Listener) => {
      ;(listeners[e] ??= []).push(cb)
      return () => { listeners[e] = (listeners[e] ?? []).filter(l => l !== cb) }
    }),
    emit(e: string, ev: { defaultPrevented?: boolean } = {}) { (listeners[e] ?? []).forEach(l => l(ev)) },
  }
}

function withNav(nav: unknown) {
  return function NavWrapper({ children }: { children: React.ReactNode }) {
    return <NavigationContext.Provider value={nav as never}>{children}</NavigationContext.Provider>
  }
}

describe('useScrollToTopOnReselect', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const target = () => ({ current: { scrollTo: jest.fn() } })

  it('a tab screen scrolls to the top when its tab is pressed again', () => {
    const nav = fakeNav('tab')
    const ref = target()
    renderHook(() => useScrollToTopOnReselect(ref), { wrapper: withNav(nav) })
    act(() => { nav.emit('tabPress'); jest.runAllTimers() })
    expect(ref.current.scrollTo).toHaveBeenCalledWith({ y: 0, animated: true })
  })

  it('a stack root inside a tab (Search) listens to the tab, not its stack', () => {
    const tab = fakeNav('tab')
    const stack = fakeNav('stack', { index: 0, parent: tab })
    const ref = target()
    renderHook(() => useScrollToTopOnReselect(ref), { wrapper: withNav(stack) })
    act(() => { tab.emit('tabPress'); jest.runAllTimers() })
    expect(ref.current.scrollTo).toHaveBeenCalledTimes(1)
  })

  it('a pushed screen inside the tab stack is left alone (the stack pops instead)', () => {
    const tab = fakeNav('tab')
    const stack = fakeNav('stack', { index: 1, parent: tab })
    const ref = target()
    renderHook(() => useScrollToTopOnReselect(ref), { wrapper: withNav(stack) })
    act(() => { tab.emit('tabPress'); jest.runAllTimers() })
    expect(ref.current.scrollTo).not.toHaveBeenCalled()
  })

  it('a stack screen outside the tabs does nothing', () => {
    const root = fakeNav('stack')
    const ref = target()
    renderHook(() => useScrollToTopOnReselect(ref), { wrapper: withNav(root) })
    expect(root.addListener).not.toHaveBeenCalled()
  })
})
