import React, { createRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { glass, radius } from '../../../theme/tokens'
import type { PlatformCapabilities } from '../../../hooks/usePlatformCapabilities'

// The tier matrix renders each platform's real <Glass> file against the
// capabilities that the real resolver produces for that device.
let mockCaps: PlatformCapabilities
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  ...jest.requireActual('../../../hooks/usePlatformCapabilities'),
  usePlatformCapabilities: () => mockCaps,
}))

const { resolveBlurTier } = jest.requireActual('../../../hooks/usePlatformCapabilities') as
  typeof import('../../../hooks/usePlatformCapabilities')

type Os = 'ios' | 'android' | 'web'
const impl = (os: Os) => ({
  ios: () => require('../Glass.ios').Glass,
  android: () => require('../Glass.android').Glass,
  web: () => require('../Glass.web').Glass,
}[os]())

function device(os: Os, opts: { apiLevel?: number; liquidGlass?: boolean; reduceTransparency?: boolean; cssBackdrop?: boolean } = {}) {
  const liquidGlass = os === 'ios' && !!opts.liquidGlass
  const reduceTransparency = !!opts.reduceTransparency
  mockCaps = {
    liquidGlass,
    reduceTransparency,
    reduceMotion: false,
    blurTier: resolveBlurTier({ os, apiLevel: opts.apiLevel, liquidGlass, reduceTransparency, cssBackdrop: opts.cssBackdrop ?? true }),
  }
}

const target = createRef<View>()
function renderGlass(os: Os, props: Record<string, unknown> = {}) {
  const Glass = impl(os)
  render(
    <Glass testID="glass" variant="bar" blurTarget={target} {...props}>
      <Text>Today</Text>
    </Glass>,
  )
  return screen.getByTestId('glass')
}
const flat = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>

describe('<Glass> tier matrix', () => {
  it('iOS 26: Liquid Glass (GlassView, regular, light scheme)', () => {
    device('ios', { liquidGlass: true })
    const el = renderGlass('ios')
    expect(el.type).toBe('ExpoGlassView')
    expect(el.props.glassEffectStyle).toBe('regular')
    expect(el.props.colorScheme).toBe('light')
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('iOS 18: BlurView with the light chrome material', () => {
    device('ios')
    const el = renderGlass('ios')
    expect(el.type).toBe('ExpoBlurView')
    expect(el.props.tint).toBe('systemChromeMaterialLight')
    expect(screen.getByText('Today')).toBeTruthy()
  })

  it('Android API 31: Dimezis blur over the blur target', () => {
    device('android', { apiLevel: 31 })
    const el = renderGlass('android')
    expect(el.type).toBe('ExpoBlurView')
    expect(el.props.blurMethod).toBe('dimezisBlurViewSdk31Plus')
    expect(el.props.blurTarget).toBe(target)
    expect(el.props.tint).toBe('light')
  })

  it('Android API 31 without a blur target: opaque (no translucent "none" fallback)', () => {
    device('android', { apiLevel: 31 })
    const el = renderGlass('android', { blurTarget: undefined })
    expect(el.type).not.toBe('ExpoBlurView')
    expect(flat(el).backgroundColor).toBe('#fdf4f4')
  })

  it('Android API 30: opaque #fdf4f4', () => {
    device('android', { apiLevel: 30 })
    const el = renderGlass('android')
    expect(el.type).not.toBe('ExpoBlurView')
    expect(flat(el).backgroundColor).toBe('#fdf4f4')
  })

  it('web: the CSS recipe', () => {
    device('web')
    const style = flat(renderGlass('web'))
    expect(style.backgroundColor).toBe(glass.fill)
    expect(style.backdropFilter).toBe(glass.backdropFilter)
    expect(style.WebkitBackdropFilter).toBe(glass.backdropFilter)
    expect(style.boxShadow).toBe(glass.webShadow)
  })

  it('web without backdrop-filter support (@supports fallback): opaque', () => {
    device('web', { cssBackdrop: false })
    const style = flat(renderGlass('web'))
    expect(style.backgroundColor).toBe('#fdf4f4')
    expect(style.backdropFilter).toBeUndefined()
  })

  it.each([
    ['iOS 26', 'ios', { liquidGlass: true }],
    ['iOS 18', 'ios', {}],
    ['Android 31', 'android', { apiLevel: 31 }],
    ['web', 'web', {}],
  ] as const)('Reduce Transparency on %s: opaque #fdf4f4', (_label, os, opts) => {
    device(os, { ...opts, reduceTransparency: true })
    const el = renderGlass(os)
    expect(['ExpoGlassView', 'ExpoBlurView']).not.toContain(el.type)
    const style = flat(el)
    expect(style.backgroundColor).toBe('#fdf4f4')
    expect(style.backdropFilter).toBeUndefined()
  })
})

describe('<Glass> shape and overrides', () => {
  it.each([
    ['bar', radius.capsule],
    ['button', radius.capsule],
    ['header', 0],
  ] as const)('variant %s has radius %i and clips its content', (variant, r) => {
    device('android', { apiLevel: 30 })
    const style = flat(renderGlass('android', { variant }))
    expect(style.borderRadius).toBe(r)
    expect(style.overflow).toBe('hidden')
  })

  it('merges a caller style', () => {
    device('android', { apiLevel: 30 })
    expect(flat(renderGlass('android', { style: { height: 62 } })).height).toBe(62)
  })

  it('a requested tier can only step down, never up', () => {
    device('ios')
    expect(renderGlass('ios', { tier: 'liquid' }).type).toBe('ExpoBlurView')
    device('ios', { liquidGlass: true })
    expect(renderGlass('ios', { tier: 'opaque' }).type).not.toBe('ExpoGlassView')
    device('ios', { liquidGlass: true })
    expect(renderGlass('ios', { tier: 'blur' }).type).toBe('ExpoBlurView')
  })

  it('the default <Glass> (unknown platform) is opaque', () => {
    device('android', { apiLevel: 34 })
    // Explicit extension: plain '../Glass' resolves to Glass.ios under jest-expo.
    const { Glass } = require('../Glass.tsx')
    render(<Glass testID="glass"><Text>x</Text></Glass>)
    expect(flat(screen.getByTestId('glass')).backgroundColor).toBe('#fdf4f4')
  })
})
