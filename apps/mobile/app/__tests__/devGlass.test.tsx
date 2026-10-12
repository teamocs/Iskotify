import React from 'react'
import { render, screen } from '@testing-library/react-native'

const mockRedirect = jest.fn()
jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) => { mockRedirect(href); return null },
}))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// expo-router turns every file under app/ into a route (a leading `__` does
// not hide it), so the demo ships as a file and must refuse to render outside
// development builds.
describe('app/__dev/glass (development-only glass tier demo)', () => {
  const dev = (global as { __DEV__?: boolean }).__DEV__
  afterEach(() => {
    ;(global as { __DEV__?: boolean }).__DEV__ = dev
    mockRedirect.mockClear()
  })

  it('redirects home in a production build and renders nothing of the demo', () => {
    ;(global as { __DEV__?: boolean }).__DEV__ = false
    const Route = require('../__dev/glass').default
    render(<Route />)
    expect(mockRedirect).toHaveBeenCalledWith('/')
    expect(screen.queryByText(/Liquid Glass/)).toBeNull()
  })

  it('shows every tier and the device capabilities in development', async () => {
    ;(global as { __DEV__?: boolean }).__DEV__ = true
    const Route = require('../__dev/glass').default
    render(<Route />)
    expect(mockRedirect).not.toHaveBeenCalled()
    for (const tier of ['liquid', 'blur', 'android-blur', 'css', 'opaque']) {
      expect(screen.getByText(new RegExp(`^${tier}\\b`))).toBeTruthy()
    }
    // Once the OS answers (jest renders as iOS 18 with Reduce Transparency off).
    expect(await screen.findByText(/This device: blur./)).toBeTruthy()
  })
})
