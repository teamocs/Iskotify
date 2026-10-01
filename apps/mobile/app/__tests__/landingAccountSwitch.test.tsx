/** Batch C review (2) — the native sign-in fallback reconciles the account owner BEFORE it writes the profile or syncs. */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import LandingScreen from '../landing'

const mockOrder: string[] = []
const mockReconcile = jest.fn(async (_db: unknown, _id: string) => { mockOrder.push('reconcile'); return 'switched' })
const mockPull = jest.fn(async () => { mockOrder.push('pull') })
const mockPush = jest.fn(async () => { mockOrder.push('push') })
jest.mock('../../services/sync', () => ({
  reconcileAccountOwner: (db: unknown, id: string) => mockReconcile(db, id),
  pullUserData: () => mockPull(),
  pushUserData: () => mockPush(),
}))

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), push: jest.fn() } }))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
jest.mock('expo-linking', () => ({ createURL: jest.fn(() => 'iskotify://auth/callback') }))
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn().mockResolvedValue({ type: 'success', url: 'iskotify://auth/callback?code=abc' }),
}))
jest.mock('../../services/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://accounts.google.test' }, error: null }),
      exchangeCodeForSession: jest.fn().mockResolvedValue({ error: null }),
      getSession: jest.fn().mockResolvedValue({ data: { session: {} } }),
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-B', email: 'b@x.ph', user_metadata: {} } } }),
    },
    from: jest.fn(() => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    })),
  },
}))
jest.mock('../../hooks/useDb', () => ({
  useDb: () => mockDb,
}))
const mockDb: any = {
  insert: jest.fn(() => ({
    values: jest.fn(() => {
      mockOrder.push('settings-write')
      return { onConflictDoUpdate: jest.fn().mockResolvedValue(undefined) }
    }),
  })),
  select: jest.fn(() => ({
    from: () => ({
      where: () => ({ limit: jest.fn().mockResolvedValue([]) }),
      limit: jest.fn().mockResolvedValue([]),
    }),
  })),
}

it('reconciles the owner with the signed-in user id first, then writes settings, then syncs', async () => {
  render(<LandingScreen />)
  fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }))
  await waitFor(() => expect(mockOrder).toContain('push'))
  expect(mockReconcile).toHaveBeenCalledWith(mockDb, 'user-B')
  expect(mockOrder).toEqual(['reconcile', 'settings-write', 'push'])
})

describe('landing sign-in safety', () => {
  beforeEach(() => { mockOrder.length = 0; mockPull.mockClear(); mockPush.mockClear(); mockDb.insert.mockClear() })

  it('a failed backup-existence check neither pulls nor pushes', async () => {
    const { supabase } = require('../../services/supabase')
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'JWT expired' } }) }) }) }),
    }))
    render(<LandingScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(require('expo-router').router.replace).toHaveBeenCalled())
    expect(mockPull).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('if clearing the previous account fails, B is not written onto A and an error is shown', async () => {
    mockReconcile.mockRejectedValueOnce(new Error('disk full'))
    render(<LandingScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Continue with Google' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockPull).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
