/**
 * The web glimpse (P4). The launch gate only runs on a page load and on auth
 * events, so a signed-out visitor could otherwise follow an in-app link from the
 * guest diagnostic to any route. This guard re-applies the same allowlist on
 * every route change while signed out.
 */
import React from 'react'
import { Platform } from 'react-native'
import { render, waitFor } from '@testing-library/react-native'
import { WebGuestRouteGuard } from '../WebGuestRouteGuard'

let mockPath = '/try'
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  usePathname: () => mockPath,
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
}))
let mockGuest = true
const mockIsGuest = jest.fn(async () => mockGuest)
jest.mock('../../../services/guestSession', () => ({ isSignedOutWebGuest: () => mockIsGuest() }))

const flush = () => new Promise(r => setTimeout(r, 0))

describe('WebGuestRouteGuard', () => {
  let restoreOS: { restore(): void } | null = null
  beforeEach(() => {
    jest.clearAllMocks()
    mockGuest = true
    mockPath = '/try'
  })
  afterEach(() => { restoreOS?.restore(); restoreOS = null })

  it('does nothing on native', async () => {
    mockPath = '/practice/upcat/all'
    render(<WebGuestRouteGuard enabled />)
    await flush()
    expect(mockIsGuest).not.toHaveBeenCalled()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  describe('web', () => {
    beforeEach(() => { restoreOS = jest.replaceProperty(Platform, 'OS', 'web') })

    it.each(['/try', '/practice/diagnostic', '/auth/sign-in', '/terms', '/privacy'])('leaves a guest on %s', async (p) => {
      mockPath = p
      render(<WebGuestRouteGuard enabled />)
      await flush()
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it.each(['/practice/upcat/all', '/practice/exam/upcat', '/practice/review/upcat', '/(tabs)', '/upgrade', '/'])(
      'sends a guest who followed a link to %s back to sign-in', async (p) => {
        mockPath = p
        render(<WebGuestRouteGuard enabled />)
        await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in'))
      },
    )

    it('re-checks on every route change', async () => {
      const { rerender } = render(<WebGuestRouteGuard enabled />)
      await flush()
      expect(mockReplace).not.toHaveBeenCalled()
      mockPath = '/practice/upcat/Science'
      rerender(<WebGuestRouteGuard enabled />)
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in'))
    })

    it('never moves a signed-in student', async () => {
      mockGuest = false
      mockPath = '/practice/upcat/all'
      render(<WebGuestRouteGuard enabled />)
      await flush()
      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('waits for the launch routing', async () => {
      mockPath = '/practice/upcat/all'
      render(<WebGuestRouteGuard enabled={false} />)
      await flush()
      expect(mockIsGuest).not.toHaveBeenCalled()
    })
  })
})
