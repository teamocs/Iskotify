import AsyncStorage from '@react-native-async-storage/async-storage'

// The last few searches, on this device only (never synced or uploaded).
// Storage can be missing or full; every call fails soft to "no recents".

const KEY = 'iskotify:recent-searches:v1'
export const MAX_RECENT = 5

export function addRecent(list: readonly string[], query: string): string[] {
  const q = query.trim()
  if (q.length < 2) return [...list]
  const rest = list.filter(r => r.toLowerCase() !== q.toLowerCase())
  return [q, ...rest].slice(0, MAX_RECENT)
}

export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    const v: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

/**
 * Forget every recent search on this device. Called by sign-out, Reset app
 * data and Delete account, so the next person never sees what was searched.
 */
export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY)
  } catch {
    // storage unavailable: nothing was persisted either
  }
}

export async function saveRecentSearches(list: readonly string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT)))
  } catch {
    // storage unavailable: recents just won't persist
  }
}
