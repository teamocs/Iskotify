/**
 * Entry frame on wide windows: the phone layout is one column; from the
 * expanded breakpoint (desktop web, large tablets) the form sits in a card
 * beside a brand panel, instead of a lone 440px column on an empty field.
 */
import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { AuthLayout } from '../AuthLayout'

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

describe('AuthLayout', () => {
  it('phones: one column, no brand panel', () => {
    mockBp = 'compact'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.getByText('form')).toBeTruthy()
    expect(screen.queryByTestId('brand-panel')).toBeNull()
  })

  it('desktop: a brand panel with the tagline and what the app is for, beside the form', () => {
    mockBp = 'expanded'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.getByTestId('brand-panel')).toBeTruthy()
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    expect(screen.getByText(/UPCAT and other college entrance exams/)).toBeTruthy()
    expect(screen.getByText('form')).toBeTruthy()
  })

  it('the brand panel adds no heading of its own (the form keeps the one h1)', () => {
    mockBp = 'expanded'
    render(<AuthLayout><Text>form</Text></AuthLayout>)
    expect(screen.queryAllByRole('header')).toHaveLength(0)
  })
})

// iOS redesign P4: the sign-in hero also renders on native (e.g. "Suggest a
// date correction" pushes /auth/sign-in when signed out), so its sheet tier
// and keyboard avoidance are checked per platform.
// A device whose glass tier is the iOS blur material (iOS 18-style).
jest.mock('../../../hooks/usePlatformCapabilities', () => ({
  ...jest.requireActual('../../../hooks/usePlatformCapabilities'),
  usePlatformCapabilities: () => ({ liquidGlass: false, blurTier: 'blur', reduceTransparency: false, reduceMotion: false }),
}))

describe('AuthHeroLayout / AuthSheet on native', () => {
  const RN = require('react-native')
  const { AuthHeroLayout, AuthSheet } = require('../AuthLayout')
  const { Glass } = require('../../ui/Glass')
  const { glass } = require('../../../theme/tokens')
  let restore: { restore(): void } | null = null
  afterEach(() => { restore?.restore(); restore = null })

  function renderHero() {
    mockBp = 'compact'
    return render(
      <AuthHeroLayout>
        <AuthSheet testID="auth-sheet"><Text>form</Text></AuthSheet>
      </AuthHeroLayout>,
    )
  }

  it('iOS: the sheet asks for the light system material (blur tier)', () => {
    restore = jest.replaceProperty(RN.Platform, 'OS', 'ios')
    const { UNSAFE_root } = renderHero()
    expect(UNSAFE_root.findByType(Glass).props.tier).toBe('blur')
    const blur = UNSAFE_root.findAll((n: { type: unknown }) => n.type === 'ExpoBlurView')
    expect(blur.length).toBe(1)
    expect(blur[0]!.props.tint).toBe(glass.iosMaterial)
  })

  it('Android: the sheet is the opaque page ground (no blur target over the hero)', () => {
    restore = jest.replaceProperty(RN.Platform, 'OS', 'android')
    const { UNSAFE_root } = renderHero()
    expect(UNSAFE_root.findByType(Glass).props.tier).toBe('opaque')
    expect(UNSAFE_root.findAll((n: { type: unknown }) => n.type === 'ExpoBlurView')).toHaveLength(0)
    const flat = Object.assign({}, ...[screen.getByTestId('auth-sheet').props.style].flat(Infinity).filter(Boolean))
    expect(flat.backgroundColor).toBe(glass.opaque)
  })

  it('native: the email/password form rides above the keyboard', () => {
    restore = jest.replaceProperty(RN.Platform, 'OS', 'android')
    const { UNSAFE_root } = renderHero()
    expect(UNSAFE_root.findAllByType(RN.KeyboardAvoidingView).length).toBe(1)
    expect(screen.getByText('form')).toBeTruthy()
  })

  it('the hero carries the tagline in white', () => {
    const { lightTheme } = require('../../../theme/tokens')
    renderHero()
    const tagline = screen.getByText('Para sa mga Iskolar ng Bayan')
    expect(Object.assign({}, ...[tagline.props.style].flat(Infinity).filter(Boolean)).color).toBe(lightTheme.textInverse)
  })
})
