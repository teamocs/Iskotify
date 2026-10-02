// The web glimpse (P4): /try lets a signed-out web visitor (no iOS app yet) take
// the free diagnostic, then invites them to create a free account.
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import TryScreen from '../try'

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => false },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

let mockGuest: { mode: 'checking' | 'member' | 'guest' | 'held'; catalogReady: boolean } = { mode: 'guest', catalogReady: true }
jest.mock('../../hooks/useGuestMode', () => ({ useGuestMode: () => mockGuest }))

let mockRunnable: unknown[] = []
const mockList = jest.fn(async () => mockRunnable)
jest.mock('../../services/examBlueprints', () => ({ listRunnableBlueprints: () => mockList() }))
jest.mock('../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})

const bp = (slug: string, acronym: string, name: string) => ({ slug, acronym, name, totalItems: 100, totalTimeMinutes: 100, items: 100, minutes: 100 })

beforeEach(() => {
  mockPush.mockReset()
  mockReplace.mockReset()
  mockList.mockClear()
  mockGuest = { mode: 'guest', catalogReady: true }
  mockRunnable = [bp('acet', 'ACET', 'Ateneo College Entrance Test')]
})

describe('/try', () => {
  it('explains what it is: a timed diagnostic, nothing saved to an account, results stay on this device', async () => {
    render(<TryScreen />)
    expect(await screen.findByText('Try a free diagnostic')).toBeTruthy()
    expect(screen.getByText(/one minute per question/i)).toBeTruthy()
    expect(screen.getByText(/Nothing is saved to an account/)).toBeTruthy()
    expect(screen.getByText(/stay on this device/)).toBeTruthy()
  })

  it('offers UPCAT and only the exams with a runnable blueprint', async () => {
    render(<TryScreen />)
    expect(await screen.findByRole('radio', { name: /UPCAT/ })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /ACET/ })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByText(/Up to 40 questions · one minute each/)).toBeTruthy()
  })

  it('shows the Terms and Privacy notice with working links', async () => {
    render(<TryScreen />)
    expect(await screen.findByText(/By starting you agree to the/)).toBeTruthy()
    fireEvent.press(screen.getByRole('link', { name: 'Terms' }))
    expect(mockPush).toHaveBeenCalledWith('/terms')
    fireEvent.press(screen.getByRole('link', { name: 'Privacy Policy' }))
    expect(mockPush).toHaveBeenCalledWith('/privacy')
  })

  it('starts the UPCAT diagnostic by default', async () => {
    render(<TryScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Start the diagnostic' }))
    expect(mockPush).toHaveBeenCalledWith('/practice/diagnostic?exam=upcat')
  })

  it('starts the chosen exam', async () => {
    render(<TryScreen />)
    fireEvent.press(await screen.findByRole('radio', { name: /ACET/ }))
    fireEvent.press(screen.getByRole('button', { name: 'Start the diagnostic' }))
    expect(mockPush).toHaveBeenCalledWith('/practice/diagnostic?exam=acet')
  })

  it('waits for the questions before offering a start', async () => {
    mockGuest = { mode: 'guest', catalogReady: false }
    render(<TryScreen />)
    expect(screen.getByText(/Getting the questions ready/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start the diagnostic' })).toBeNull()
  })

  it('reloads the exam list once the catalog has synced', async () => {
    mockGuest = { mode: 'guest', catalogReady: false }
    mockRunnable = []
    const { rerender } = render(<TryScreen />)
    mockGuest = { mode: 'guest', catalogReady: true }
    mockRunnable = [bp('acet', 'ACET', 'Ateneo College Entrance Test')]
    rerender(<TryScreen />)
    await waitFor(() => expect(screen.getByRole('radio', { name: /ACET/ })).toBeTruthy(), { timeout: 10_000 })
  })

  it('still offers UPCAT when the exam list cannot be read', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockList.mockRejectedValueOnce(new Error('db'))
    render(<TryScreen />)
    expect(await screen.findByRole('radio', { name: /UPCAT/ })).toBeTruthy()
    expect(screen.getAllByRole('radio')).toHaveLength(1)
  })

  it('offers sign-in to someone who already has an account', async () => {
    render(<TryScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'I have an account. Sign in' }))
    expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('a browser still holding a signed-out account asks for sign-in instead of starting a guest run', async () => {
    mockGuest = { mode: 'held', catalogReady: true }
    render(<TryScreen />)
    expect(await screen.findByText(/still holds an Iskotify account/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start the diagnostic' })).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }))
    expect(mockReplace).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('a signed-in student is sent into the app', async () => {
    mockGuest = { mode: 'member', catalogReady: true }
    render(<TryScreen />)
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(tabs)'))
  })

  it('shows no upgrade or paywall UI, even with the paywall on', async () => {
    const prev = process.env.EXPO_PUBLIC_PAYWALL_ENABLED
    process.env.EXPO_PUBLIC_PAYWALL_ENABLED = '1'
    try {
      render(<TryScreen />)
      await screen.findByRole('button', { name: 'Start the diagnostic' })
      expect(screen.queryByText(/Full Access|Upgrade|₱/)).toBeNull()
    } finally {
      process.env.EXPO_PUBLIC_PAYWALL_ENABLED = prev
    }
  })
})
