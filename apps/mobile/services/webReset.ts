// Web-only "Clear data / Start over" utility.
//
// react-native-web's Alert.alert is a no-op and clearing the Drizzle tables
// alone does NOT reset a web user: the sql.js database is persisted in
// IndexedDB ('iskotify') and the Supabase session lives in localStorage
// ('sb-*' keys). This util performs the FULL wipe so a fresh sign-in starts
// from an empty, signed-out state.
//
// Every browser API here (indexedDB, localStorage, window) is accessed behind
// typeof guards so importing this module never breaks native bundling/tests.
// Callers MUST only invoke clearWebData() when Platform.OS === 'web'.
import { supabase } from './supabase'

const WEB_DB_NAME = 'iskotify'

/**
 * Delete the sql.js IndexedDB database. Resolves on success, error, OR blocked
 * so a held connection (e.g. another tab) can never make this hang.
 */
function deleteWebDatabase(): Promise<void> {
  return new Promise<void>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB?.deleteDatabase) {
        resolve()
        return
      }
      const req = indexedDB.deleteDatabase(WEB_DB_NAME)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      // onblocked: another connection is open; the delete will complete once it
      // closes, but we resolve now so the hard reload (which drops this tab's
      // connection) can proceed and let the deletion finish.
      req.onblocked = () => resolve()
    } catch {
      resolve()
    }
  })
}

/** Remove every Supabase session key (sb-* and any 'supabase' key) from localStorage. */
function clearSupabaseLocalStorage(): void {
  try {
    if (typeof localStorage === 'undefined') return
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (/^sb-/.test(key) || key.includes('supabase'))) {
        toRemove.push(key)
      }
    }
    for (const key of toRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    /* ignore — best effort */
  }
}

/**
 * Fully reset a signed-in web user, then hard-reload to /auth/sign-in.
 *
 *   1. supabase.auth.signOut()       (best-effort)
 *   2. indexedDB.deleteDatabase()    (the sql.js persistence)
 *   3. clear sb-* / supabase localStorage session keys
 *   4. window.location.replace('/auth/sign-in')  (hard reload)
 */
export async function clearWebData(): Promise<void> {
  // 1. Sign out (best-effort — never let a network failure block the wipe).
  try {
    await supabase.auth.signOut()
  } catch (e) {
    console.warn('[webReset] signOut (non-fatal):', e)
  }

  // 2. Drop the persisted sql.js IndexedDB database.
  await deleteWebDatabase()

  // 3. Clear the Supabase session from localStorage.
  clearSupabaseLocalStorage()

  // 4. Hard reload so the fresh empty DB + no session take effect.
  try {
    if (typeof window !== 'undefined' && window.location?.replace) {
      window.location.replace('/auth/sign-in')
    }
  } catch (e) {
    console.warn('[webReset] reload (non-fatal):', e)
  }
}
