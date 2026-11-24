import React from 'react'
import { Platform } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import MockCheckoutScreen from '../mock-checkout'

const mockReplace = jest.fn()
let mockParams: { reference?: string } = { reference: 'ISK-MOCK-abc12345' }
jest.mock('expo-router', () => ({
  router: { replace: (...a: unknown[]) => mockReplace(...a) },
  useLocalSearchParams: () => mockParams,
  Redirect: () => { const { Text } = require('react-native'); return <Text testID="redirect">x</Text> },
}))
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))
const mockPremium = { enabled: true }
jest.mock('../../hooks/usePremium', () => ({ usePremium: () => mockPremium }))
const mockCall = jest.fn()
jest.mock('../../services/entitlements', () => ({ callMockPayment: (...a: unknown[]) => mockCall(...a) }))

const os = Platform.OS
beforeEach(() => { Platform.OS = 'web' as never; mockParams = { reference: 'ISK-MOCK-abc12345' }; mockReplace.mockReset(); mockCall.mockReset() })
afterAll(() => { Platform.OS = os })
const press = async (name: string) => { await act(async () => { fireEvent.press(screen.getByRole('button', { name })) }) }

it('pays through the server, then waits on the upgrade screen', async () => {
  mockCall.mockResolvedValue(true)
  render(<MockCheckoutScreen />)
  await press('Complete test payment')
  expect(mockCall).toHaveBeenCalledWith({ action: 'pay', reference: 'ISK-MOCK-abc12345' })
  expect(mockReplace).toHaveBeenCalledWith('/upgrade?status=success')
})

it('a refused test payment says so and stays', async () => {
  mockCall.mockResolvedValue(false)
  render(<MockCheckoutScreen />)
  await press('Complete test payment')
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(mockReplace).not.toHaveBeenCalled()
})

it('cancel and unconfirmed return never call the server', async () => {
  render(<MockCheckoutScreen />)
  await press('Cancel')
  expect(mockReplace).toHaveBeenLastCalledWith('/upgrade?status=cancelled')
  await press('Return without confirming')
  expect(mockReplace).toHaveBeenLastCalledWith('/upgrade?status=success')
  expect(mockCall).not.toHaveBeenCalled()
})

it('is not a page on Android or without a reference', () => {
  mockParams = {}
  const { unmount } = render(<MockCheckoutScreen />)
  expect(screen.getByTestId('redirect')).toBeTruthy()
  unmount()
  mockParams = { reference: 'ISK-MOCK-abc12345' }
  Platform.OS = 'android'
  render(<MockCheckoutScreen />)
  expect(screen.getByTestId('redirect')).toBeTruthy()
})
