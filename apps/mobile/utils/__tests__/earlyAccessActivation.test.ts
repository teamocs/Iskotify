import * as SecureStore from 'expo-secure-store'
import {
  isEarlyAccessActivated,
  setEarlyAccessActivated,
  clearEarlyAccessActivated,
} from '../earlyAccessActivation'

// expo-secure-store is mocked by jest-expo via the moduleNameMapper in the
// 'mobile' project. In the 'services' project it uses __mocks__/expoSecureStoreMock.js.
// Both expose getItemAsync / setItemAsync / deleteItemAsync as jest.fn().
// We cast to jest.MockedFunction to attach per-test return values.
const mockGetItem = SecureStore.getItemAsync as jest.MockedFunction<typeof SecureStore.getItemAsync>
const mockSetItem = SecureStore.setItemAsync as jest.MockedFunction<typeof SecureStore.setItemAsync>
const mockDeleteItem = SecureStore.deleteItemAsync as jest.MockedFunction<typeof SecureStore.deleteItemAsync>

beforeEach(() => {
  jest.clearAllMocks()
})

// ── isEarlyAccessActivated ────────────────────────────────────────────────────

describe('isEarlyAccessActivated', () => {
  it('returns true when stored value is exactly "1"', async () => {
    mockGetItem.mockResolvedValueOnce('1')
    const result = await isEarlyAccessActivated()
    expect(result).toBe(true)
    expect(mockGetItem).toHaveBeenCalledWith('early_access_activated')
  })

  it('returns false when stored value is null (key absent)', async () => {
    mockGetItem.mockResolvedValueOnce(null)
    expect(await isEarlyAccessActivated()).toBe(false)
  })

  it('returns false when stored value is anything other than "1"', async () => {
    mockGetItem.mockResolvedValueOnce('true')
    expect(await isEarlyAccessActivated()).toBe(false)

    mockGetItem.mockResolvedValueOnce('0')
    expect(await isEarlyAccessActivated()).toBe(false)

    mockGetItem.mockResolvedValueOnce('')
    expect(await isEarlyAccessActivated()).toBe(false)
  })

  it('returns false (does not throw) when SecureStore throws', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('keychain unavailable'))
    await expect(isEarlyAccessActivated()).resolves.toBe(false)
  })
})

// ── setEarlyAccessActivated ───────────────────────────────────────────────────

describe('setEarlyAccessActivated', () => {
  it('writes "1" under the correct key', async () => {
    mockSetItem.mockResolvedValueOnce(undefined)
    await setEarlyAccessActivated()
    expect(mockSetItem).toHaveBeenCalledWith('early_access_activated', '1')
  })

  it('does not throw when SecureStore throws', async () => {
    mockSetItem.mockRejectedValueOnce(new Error('keychain unavailable'))
    await expect(setEarlyAccessActivated()).resolves.toBeUndefined()
  })
})

// ── clearEarlyAccessActivated ─────────────────────────────────────────────────

describe('clearEarlyAccessActivated', () => {
  it('deletes the correct key', async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined)
    await clearEarlyAccessActivated()
    expect(mockDeleteItem).toHaveBeenCalledWith('early_access_activated')
  })

  it('does not throw when SecureStore throws', async () => {
    mockDeleteItem.mockRejectedValueOnce(new Error('keychain unavailable'))
    await expect(clearEarlyAccessActivated()).resolves.toBeUndefined()
  })
})
