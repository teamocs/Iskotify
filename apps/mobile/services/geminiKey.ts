/**
 * Secure storage wrapper for the user's Gemini API key.
 *
 * Security contract:
 * - On native: the key ONLY lives in SecureStore (iOS Keychain / Android Keystore).
 * - On web: the key is stored in localStorage (same key id). localStorage is
 *   browser-origin-scoped; it is NOT synced across devices and is cleared with
 *   site data. This is the best available option in a static web export.
 * - The key NEVER appears in SQLite, export payloads, sync payloads, or console logs.
 * - None of the functions below pass the key to any logging or error-reporting path.
 */
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const KEY_ID = 'kuya_gemini_key'

// ── Web localStorage helpers ─────────────────────────────────────────────────

function webGet(): string | null {
  try {
    return window.localStorage.getItem(KEY_ID)
  } catch {
    return null
  }
}

function webSet(key: string): void {
  window.localStorage.setItem(KEY_ID, key)
}

function webDelete(): void {
  window.localStorage.removeItem(KEY_ID)
}

// ── Public API ──────────────────────────────────────────────────────────────

/** Retrieve the stored Gemini API key, or null if none is saved. */
export async function getGeminiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webGet()
  }
  try {
    const val = await SecureStore.getItemAsync(KEY_ID)
    return val ?? null
  } catch {
    return null
  }
}

/** Persist the Gemini API key securely. */
export async function setGeminiKey(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSet(key)
    return
  }
  await SecureStore.setItemAsync(KEY_ID, key)
}

/** Delete the stored Gemini API key. */
export async function clearGeminiKey(): Promise<void> {
  if (Platform.OS === 'web') {
    webDelete()
    return
  }
  await SecureStore.deleteItemAsync(KEY_ID)
}
