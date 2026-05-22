import { createClient } from '@supabase/supabase-js'
import * as FileSystem from 'expo-file-system/legacy'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
}

// File-based auth session storage so sessions survive app restarts.
const AUTH_FILE = (FileSystem.documentDirectory ?? '') + 'sb-auth.json'

const storage = {
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

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage,
  },
})
