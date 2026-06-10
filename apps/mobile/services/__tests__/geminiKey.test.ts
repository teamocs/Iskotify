/**
 * Unit tests for services/geminiKey.ts
 * expo-secure-store is mocked via jest.mock — the key never touches real storage.
 */

const mockStore: Record<string, string | null> = {}

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (key: string) => mockStore[key] ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => { mockStore[key] = value }),
  deleteItemAsync: jest.fn(async (key: string) => { delete mockStore[key] }),
}))

import { getGeminiKey, setGeminiKey, clearGeminiKey } from '../geminiKey'

const KEY_ID = 'kuya_gemini_key'

beforeEach(() => {
  // Reset in-memory store between tests
  Object.keys(mockStore).forEach(k => { delete mockStore[k] })
  jest.clearAllMocks()
})

describe('getGeminiKey', () => {
  it('returns null when no key is stored', async () => {
    const result = await getGeminiKey()
    expect(result).toBeNull()
  })

  it('returns the stored key', async () => {
    mockStore[KEY_ID] = 'AIzaTestKey123'
    const result = await getGeminiKey()
    expect(result).toBe('AIzaTestKey123')
  })

  it('returns null (not throws) when SecureStore throws', async () => {
    const SecureStore = require('expo-secure-store')
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('SecureStore unavailable'))
    const result = await getGeminiKey()
    expect(result).toBeNull()
  })
})

describe('setGeminiKey', () => {
  it('stores the key under the correct key id', async () => {
    const SecureStore = require('expo-secure-store')
    await setGeminiKey('AIzaNewKey456')
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(KEY_ID, 'AIzaNewKey456')
  })

  it('does not log or expose the key in any observable way', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const consoleSpy2 = jest.spyOn(console, 'warn').mockImplementation(() => {})
    await setGeminiKey('AIzaSensitiveKey')
    expect(consoleSpy).not.toHaveBeenCalled()
    expect(consoleSpy2).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
    consoleSpy2.mockRestore()
  })
})

describe('clearGeminiKey', () => {
  it('deletes the stored key', async () => {
    mockStore[KEY_ID] = 'AIzaToDelete'
    await clearGeminiKey()
    const SecureStore = require('expo-secure-store')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(KEY_ID)
  })

  it('returns null after clearing', async () => {
    mockStore[KEY_ID] = 'AIzaToDelete'
    await clearGeminiKey()
    delete mockStore[KEY_ID]
    const result = await getGeminiKey()
    expect(result).toBeNull()
  })
})
