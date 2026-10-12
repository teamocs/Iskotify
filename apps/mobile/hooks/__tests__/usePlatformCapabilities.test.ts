import { AccessibilityInfo } from 'react-native'
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { isLiquidGlassAvailable, isGlassEffectAPIAvailable } from 'expo-glass-effect'
import {
  resolveBlurTier,
  detectLiquidGlass,
  usePlatformCapabilities,
  __resetPlatformCapabilitiesForTests,
} from '../usePlatformCapabilities'

const liquid = isLiquidGlassAvailable as jest.Mock
const glassApi = isGlassEffectAPIAvailable as jest.Mock

describe('resolveBlurTier', () => {
  const base = { liquidGlass: false, reduceTransparency: false, cssBackdrop: true }

  it.each([
    ['iOS 26 with Liquid Glass', { os: 'ios', liquidGlass: true }, 'liquid'],
    ['iOS 18', { os: 'ios' }, 'blur'],
    ['Android API 31', { os: 'android', apiLevel: 31 }, 'android-blur'],
    ['Android API 34', { os: 'android', apiLevel: 34 }, 'android-blur'],
    ['Android API 30', { os: 'android', apiLevel: 30 }, 'opaque'],
    ['Android, unknown API level', { os: 'android' }, 'opaque'],
    ['web with backdrop-filter', { os: 'web' }, 'css'],
    ['web without backdrop-filter', { os: 'web', cssBackdrop: false }, 'opaque'],
    ['an unknown platform', { os: 'windows' }, 'opaque'],
  ] as const)('%s → %s', (_label, input, tier) => {
    expect(resolveBlurTier({ ...base, ...input })).toBe(tier)
  })

  it.each(['ios', 'android', 'web'] as const)('Reduce Transparency forces opaque on %s', (os) => {
    expect(resolveBlurTier({ ...base, os, apiLevel: 34, liquidGlass: true, reduceTransparency: true })).toBe('opaque')
  })
})

describe('detectLiquidGlass', () => {
  afterEach(() => { liquid.mockReturnValue(false); glassApi.mockReturnValue(false) })

  it('needs BOTH isLiquidGlassAvailable() and isGlassEffectAPIAvailable()', () => {
    liquid.mockReturnValue(true); glassApi.mockReturnValue(false)
    expect(detectLiquidGlass('ios')).toBe(false)
    liquid.mockReturnValue(false); glassApi.mockReturnValue(true)
    expect(detectLiquidGlass('ios')).toBe(false)
    liquid.mockReturnValue(true); glassApi.mockReturnValue(true)
    expect(detectLiquidGlass('ios')).toBe(true)
  })

  it('is false off iOS and never throws', () => {
    liquid.mockReturnValue(true); glassApi.mockReturnValue(true)
    expect(detectLiquidGlass('android')).toBe(false)
    expect(detectLiquidGlass('web')).toBe(false)
    liquid.mockImplementation(() => { throw new Error('beta iOS 26 without the API') })
    expect(detectLiquidGlass('ios')).toBe(false)
    liquid.mockReset()
  })
})

describe('usePlatformCapabilities', () => {
  let transparencyListener: ((v: boolean) => void) | undefined

  beforeEach(() => {
    __resetPlatformCapabilitiesForTests()
    transparencyListener = undefined
    jest.spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled').mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((event: string, fn: (v: boolean) => void) => {
      if (event === 'reduceTransparencyChanged') transparencyListener = fn
      return { remove: jest.fn() }
    }) as never)
  })

  afterEach(() => jest.restoreAllMocks())

  it('starts opaque and still until the OS answers, then reports the real tier (jest renders as iOS 18)', async () => {
    const { result } = renderHook(() => usePlatformCapabilities())
    expect(result.current.reduceTransparency).toBe(true)
    expect(result.current.reduceMotion).toBe(true)
    expect(result.current.blurTier).toBe('opaque')
    await waitFor(() => expect(result.current.blurTier).toBe('blur'))
    expect(result.current).toEqual({ liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false })
  })

  it('caches at module level: a later mount reads the answer synchronously and the OS is asked once', async () => {
    const first = renderHook(() => usePlatformCapabilities())
    await waitFor(() => expect(first.result.current.blurTier).toBe('blur'))
    const asked = (AccessibilityInfo.isReduceTransparencyEnabled as jest.Mock).mock.calls.length
    const second = renderHook(() => usePlatformCapabilities())
    expect(second.result.current.blurTier).toBe('blur')
    expect(second.result.current).toBe(first.result.current)
    expect(AccessibilityInfo.isReduceTransparencyEnabled).toHaveBeenCalledTimes(asked)
  })

  it('goes opaque when Reduce Transparency is switched on', async () => {
    const { result } = renderHook(() => usePlatformCapabilities())
    await waitFor(() => expect(result.current.blurTier).toBe('blur'))
    act(() => transparencyListener?.(true))
    expect(result.current.reduceTransparency).toBe(true)
    expect(result.current.blurTier).toBe('opaque')
  })

  it('falls back to "not reduced" when the OS query fails', async () => {
    ;(AccessibilityInfo.isReduceTransparencyEnabled as jest.Mock).mockRejectedValue(new Error('no bridge'))
    const { result } = renderHook(() => usePlatformCapabilities())
    await waitFor(() => expect(result.current.reduceTransparency).toBe(false))
  })
})
