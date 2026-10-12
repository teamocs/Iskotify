/**
 * The Search tab's folder layout (iOS redesign P2b): on iOS a stack whose
 * header carries the native search field; on Android and web nothing but the
 * page (the floating bar or the page hosts the field).
 */
import React from 'react'
import { render } from '@testing-library/react-native'

const mockSeen: { stack: Record<string, unknown> | null; slot: boolean } = { stack: null, slot: false }
jest.mock('expo-router', () => ({
  Stack: (props: { screenOptions?: Record<string, unknown> }) => { mockSeen.stack = props.screenOptions ?? {}; return null },
  Slot: () => { mockSeen.slot = true; return null },
}))

beforeEach(() => { mockSeen.stack = null; mockSeen.slot = false })

describe('Search folder layout', () => {
  it('iOS: a stack with a shown, transparent, untitled header for the native field', () => {
    const Layout: React.ComponentType = require('../search/_layout.ios.tsx').default
    render(<Layout />)
    expect(mockSeen.stack).toMatchObject({ headerShown: true, headerTransparent: true, title: '' })
    expect(mockSeen.slot).toBe(false)
  })

  it('Android and web: just the page', () => {
    const Layout: React.ComponentType = require('../search/_layout.tsx').default
    render(<Layout />)
    expect(mockSeen.slot).toBe(true)
    expect(mockSeen.stack).toBeNull()
  })
})
