/**
 * Secure storage wrapper for the user's Gemini API key.
 *
 * Security contract:
 * - The key ONLY lives in SecureStore (iOS Keychain / Android Keystore).
 * - It NEVER appears in SQLite, export payloads, sync payloads, or console logs.
 * - None of the functions below pass the key to any logging or error-reporting path.
 */
import * as SecureStore from 'expo-secure-store'

const KEY_ID = 'kuya_gemini_key'

/** Retrieve the stored Gemini API key, or null if none is saved. */
export async function getGeminiKey(): Promise<string | null> {
  try {
    const val = await SecureStore.getItemAsync(KEY_ID)
    return val ?? null
  } catch {
    return null
  }
}

/** Persist the Gemini API key securely. */
export async function setGeminiKey(key: string): Promise<void> {
  await SecureStore.setItemAsync(KEY_ID, key)
}

/** Delete the stored Gemini API key. */
export async function clearGeminiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_ID)
}
