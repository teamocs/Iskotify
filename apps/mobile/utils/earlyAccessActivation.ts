/**
 * earlyAccessActivation — SecureStore flag for the native early-access gate.
 *
 * A first-time APK install must prove (once, online) that the user is an
 * approved early-access registrant. After that the flag is persisted in
 * SecureStore (iOS Keychain / Android Keystore) so the app works offline
 * forever with no further network check.
 *
 * All three functions are forgiving: they catch every error so a SecureStore
 * hiccup can never crash the boot sequence.
 */
import * as SecureStore from 'expo-secure-store'

const ACTIVATION_KEY = 'early_access_activated'

/**
 * Returns true iff the activation flag has been written (value === '1').
 * Any read error → false (fail-safe, never crashes boot).
 */
export async function isEarlyAccessActivated(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(ACTIVATION_KEY)
    return val === '1'
  } catch (e) {
    console.warn('[earlyAccessActivation] read error (defaulting to false):', e)
    return false
  }
}

/**
 * Marks early access as activated. Safe to call multiple times (idempotent).
 * Catches and logs errors — callers must not rely on a throw for control flow.
 */
export async function setEarlyAccessActivated(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ACTIVATION_KEY, '1')
  } catch (e) {
    console.warn('[earlyAccessActivation] write error:', e)
  }
}

/**
 * Clears the activation flag. Intended for tests and sign-out-of-activation
 * flows. Catches and logs errors — does not throw.
 */
export async function clearEarlyAccessActivated(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACTIVATION_KEY)
  } catch (e) {
    console.warn('[earlyAccessActivation] delete error:', e)
  }
}
