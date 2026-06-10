import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

// ── Web: localStorage-backed storage adapter ──────────────────────────────────
// On web the expo-file-system shim no-ops, so sessions would be memory-only
// (sign out on every refresh) and the PKCE code-verifier can't persist
// (Google OAuth broken). Use window.localStorage instead, with try/catch so
// SSR / headless environments don't throw.
const webStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {}
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch {}
  },
}

// ── Native: file-based auth session storage (byte-identical to original) ──────
// Survives app restarts without any keychain dependency.
const AUTH_FILE = (FileSystem.documentDirectory ?? '') + 'sb-auth.json'

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const raw = await FileSystem.readAsStringAsync(AUTH_FILE)
      const map = JSON.parse(raw) as Record<string, string>
      return map[key] ?? null
    } catch {
      return null
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      let map: Record<string, string> = {}
      try {
        const raw = await FileSystem.readAsStringAsync(AUTH_FILE)
        map = JSON.parse(raw)
      } catch {}
      map[key] = value
      await FileSystem.writeAsStringAsync(AUTH_FILE, JSON.stringify(map))
    } catch {}
  },
  async removeItem(key: string): Promise<void> {
    try {
      const raw = await FileSystem.readAsStringAsync(AUTH_FILE)
      const map = JSON.parse(raw) as Record<string, string>
      delete map[key]
      await FileSystem.writeAsStringAsync(AUTH_FILE, JSON.stringify(map))
    } catch {}
  },
}

const storage = Platform.OS === 'web' ? webStorage : nativeStorage

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    // On web, detectSessionInUrl: true lets supabase-js auto-exchange the
    // PKCE code/hash that appears after Google OAuth redirect, catching both
    // query-param codes and hash-based flows (password reset).
    // Native keeps false — deep-link routing in _layout handles it instead.
    detectSessionInUrl: Platform.OS === 'web',
    storage,
  },
})
