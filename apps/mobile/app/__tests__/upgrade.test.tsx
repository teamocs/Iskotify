// P3: the /upgrade screen (Iskotify Full Access). Store + server calls are mocked;
// their own behaviour is covered in services/__tests__/premium*.test.ts.
import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import UpgradeScreen from '../upgrade'

let mockParams: { status?: string; from?: string } = {}
const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn(), canGoBack: () => false },
  useLocalSearchParams: () => mockParams,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native')
    return <Text testID="redirect">{href}</Text>
  },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const mockPremium = { enabled: true, isPremium: false, unlimited: false, loading: false, refresh: jest.fn(async () => false) }
jest.mock('../../hooks/usePremium', () => ({ usePremium: () => mockPremium }))

const mockStore: { channel: 'play' | 'web'; price: string | null; available: boolean } = { channel: 'play', price: '₱500.00', available: true }
jest.mock('../../services/premium', () => ({
  get PURCHASE_CHANNEL() { return mockStore.channel },
  storeAvailable: () => mockStore.available,
  getFullAccessPrice: jest.fn(async () => mockStore.price),
}))

const mockBuy = jest.fn()
const mockRestore = jest.fn()
const mockConfirm = jest.fn()
const mockPoll = jest.fn()
jest.mock('../../services/premiumState', () => ({
  buyFullAccess: () => mockBuy(),
  restoreFullAccessForUser: () => mockRestore(),
  confirmPurchase: (...a: unknown[]) => mockConfirm(...a),
  pollPremium: (...a: unknown[]) => mockPoll(...a),
}))

const mockSession: { signedIn: boolean } = { signedIn: true }
jest.mock('../../services/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: mockSession.signedIn ? { user: { id: 'u1' } } : null } })) } },
}))

const mockCapture = jest.fn()
jest.mock('../../lib/analytics', () => ({ capture: (...a: unknown[]) => mockCapture(...a) }))

beforeEach(() => {
  mockParams = {}
  mockPush.mockReset()
  mockReplace.mockReset()
  Object.assign(mockPremium, { enabled: true, isPremium: false, unlimited: false, loading: false })
  Object.assign(mockStore, { channel: 'play', price: '₱500.00', available: true })
  mockSession.signedIn = true
  mockBuy.mockReset().mockResolvedValue({ status: 'success' })
  mockRestore.mockReset().mockResolvedValue({ status: 'nothing_to_restore' })
  mockConfirm.mockReset().mockResolvedValue('confirmed')
  mockPoll.mockReset().mockResolvedValue(true)
  mockCapture.mockReset()
})

const allText = () => JSON.stringify(screen.toJSON())

it('flag off: there is no upgrade screen', () => {
  mockPremium.enabled = false
  render(<UpgradeScreen />)
  expect(screen.getByTestId('redirect')).toBeTruthy()
  expect(screen.queryByText(/Full Access/)).toBeNull()
})

describe('Android (Google Play)', () => {
  it('shows what is included, the Play price, one-time wording, the guardian line and the Terms', async () => {
    mockParams = { from: 'practice_cap' }
    render(<UpgradeScreen />)
    expect(screen.getByRole('header', { name: 'Iskotify Full Access' })).toBeTruthy()
    expect(await screen.findByText(/₱500\.00/)).toBeTruthy()
    expect(screen.getByText(/Unlimited practice questions/)).toBeTruthy()
    expect(screen.getByText(/one-time payment/i)).toBeTruthy()
    expect(screen.getByText(/not a subscription/i)).toBeTruthy()
    expect(screen.getByText('Under 18? Ask your parent or guardian before you buy.')).toBeTruthy()
    expect(screen.getByRole('link', { name: /terms/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Buy through Google Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy()
    expect(mockCapture).toHaveBeenCalledWith('paywall_viewed', expect.objectContaining({ source: 'practice_cap', channel: 'play' }))
  })

  it('never mentions a web purchase or the website price', async () => {
    render(<UpgradeScreen />)
    await screen.findByText(/₱500\.00/)
    expect(allText()).not.toMatch(/web|website|GCash|Maya|PayMongo|iskotify\.ph/i)
  })

  it('buys, waits for the server to confirm, then shows Full Access', async () => {
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(btn) })
    expect(mockBuy).toHaveBeenCalled()
    expect(mockConfirm).toHaveBeenCalled()
    expect(await screen.findByText('You have Full Access')).toBeTruthy()
    expect(mockCapture).toHaveBeenCalledWith('purchase_started', expect.objectContaining({ channel: 'play' }))
    expect(mockCapture).toHaveBeenCalledWith('purchase_completed', expect.objectContaining({ channel: 'play' }))
  })

  it('a cancelled purchase says nothing and leaves the button ready', async () => {
    mockBuy.mockResolvedValue({ status: 'cancelled' })
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(btn) })
    expect(mockConfirm).not.toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Buy through Google Play' })).toBeTruthy()
  })

  it('shows an error with a retry', async () => {
    mockBuy.mockResolvedValueOnce({ status: 'error', message: "We couldn't finish the purchase. Please try again." })
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(btn) })
    expect(screen.getByText("We couldn't finish the purchase. Please try again.")).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Try again' })) })
    expect(mockBuy).toHaveBeenCalledTimes(2)
  })

  it('when the confirmation is slow, says it may take a minute and offers a refresh', async () => {
    mockConfirm.mockResolvedValue('pending')
    mockPoll.mockResolvedValue(true)
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(btn) })
    expect(screen.getByText(/may take a minute/i)).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Check again' })) })
    expect(mockPoll).toHaveBeenCalled()
    expect(await screen.findByText('You have Full Access')).toBeTruthy()
  })

  it('restores a purchase through the same confirmation', async () => {
    mockRestore.mockResolvedValue({ status: 'success' })
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Restore purchases' })
    await act(async () => { fireEvent.press(btn) })
    expect(mockConfirm).toHaveBeenCalled()
    expect(await screen.findByText('You have Full Access')).toBeTruthy()
  })

  it('says so when there is nothing to restore', async () => {
    mockPoll.mockResolvedValue(false)
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Restore purchases' })
    await act(async () => { fireEvent.press(btn) })
    expect(screen.getByText(/couldn't find a Full Access purchase/i)).toBeTruthy()
  })

  it('needs an account first, and sends the student to sign in', async () => {
    mockSession.signedIn = false
    render(<UpgradeScreen />)
    const signIn = await screen.findByRole('button', { name: 'Sign in to continue' })
    expect(screen.queryByRole('button', { name: 'Buy through Google Play' })).toBeNull()
    expect(screen.getByText(/works on every device/i)).toBeTruthy()
    fireEvent.press(signIn)
    expect(mockPush).toHaveBeenCalled()
  })

  it('already Full Access: says so and offers no purchase', async () => {
    Object.assign(mockPremium, { isPremium: true, unlimited: true })
    render(<UpgradeScreen />)
    expect(await screen.findByText('You have Full Access')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Buy through Google Play' })).toBeNull()
  })
})

describe('one purchase at a time', () => {
  const never = () => new Promise<never>(() => {})

  it('a double tap on Buy starts only one purchase', async () => {
    mockBuy.mockImplementation(never)
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(btn); fireEvent.press(btn) })
    expect(mockBuy).toHaveBeenCalledTimes(1)
  })

  it('a double tap on Restore starts only one restore', async () => {
    mockRestore.mockImplementation(never)
    render(<UpgradeScreen />)
    const btn = await screen.findByRole('button', { name: 'Restore purchases' })
    await act(async () => { fireEvent.press(btn); fireEvent.press(btn) })
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })

  it('Try again shows loading and a double tap retries once', async () => {
    mockBuy.mockResolvedValueOnce({ status: 'error', message: 'Nope.' }).mockImplementation(never)
    render(<UpgradeScreen />)
    const buyBtn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(buyBtn) })
    const retry = screen.getByRole('button', { name: 'Try again' })
    await act(async () => { fireEvent.press(retry); fireEvent.press(retry) })
    expect(mockBuy).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { busy: true })).toBeTruthy()
  })
})

describe('leaving the screen', () => {
  it('stops waiting for the confirmation when the screen closes', async () => {
    let signal: AbortSignal | undefined
    mockConfirm.mockImplementation((opts?: { signal?: AbortSignal }) => { signal = opts?.signal; return new Promise(() => {}) })
    const { unmount } = render(<UpgradeScreen />)
    const buyBtn = await screen.findByRole('button', { name: 'Buy through Google Play' })
    await act(async () => { fireEvent.press(buyBtn) })
    expect(signal).toBeDefined()
    expect(signal!.aborted).toBe(false)
    unmount()
    expect(signal!.aborted).toBe(true)
  })

  it('stops polling for a web payment when the screen closes', async () => {
    Object.assign(mockStore, { channel: 'web', price: '₱500' })
    mockParams = { status: 'success' }
    let signal: AbortSignal | undefined
    mockPoll.mockImplementation((opts?: { signal?: AbortSignal }) => { signal = opts?.signal; return new Promise(() => {}) })
    const { unmount } = render(<UpgradeScreen />)
    await screen.findByText(/Confirming your purchase/)
    unmount()
    expect(signal?.aborted).toBe(true)
  })
})

describe('no store on this device (iOS, or a build without the store key)', () => {
  it('offers no purchase and says so neutrally, never pointing to the web', async () => {
    mockStore.available = false
    mockStore.price = null
    render(<UpgradeScreen />)
    expect(await screen.findByText('Not available on this device yet.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Buy through Google Play' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Restore purchases' })).toBeNull()
    expect(allText()).not.toMatch(/web|website|GCash|Maya|PayMongo|iskotify\.ph/i)
  })
})

describe('web (PayMongo)', () => {
  beforeEach(() => { Object.assign(mockStore, { channel: 'web', price: '₱500' }) })

  it('offers GCash, Maya or card at ₱500, no restore', async () => {
    render(<UpgradeScreen />)
    expect(await screen.findByRole('button', { name: 'Pay with GCash, Maya or card' })).toBeTruthy()
    expect(screen.getByText(/₱500/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Restore purchases' })).toBeNull()
  })

  it('back from PayMongo with success: confirms with the server, then shows Full Access', async () => {
    mockParams = { status: 'success' }
    render(<UpgradeScreen />)
    expect(await screen.findByText('You have Full Access')).toBeTruthy()
    expect(mockPoll).toHaveBeenCalled()
    expect(mockCapture).toHaveBeenCalledWith('purchase_completed', expect.objectContaining({ channel: 'web' }))
  })

  it('back from PayMongo cancelled: says nothing was charged and offers to try again', async () => {
    mockParams = { status: 'cancelled' }
    render(<UpgradeScreen />)
    expect(await screen.findByText(/cancelled/i)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pay with GCash, Maya or card' })).toBeTruthy()
  })
})
