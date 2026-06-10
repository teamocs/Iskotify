/**
 * services/queryCache.ts
 *
 * In-memory TTL/SWR cache with prefix-based invalidation and subscriber notifications.
 *
 * Design:
 *   - Module-level Maps for cache entries, in-flight promises, fetchers, and subscribers.
 *   - cachedQuery<T>(key, ttlMs, fetcher): SWR semantics — if entry exists but age > ttl,
 *     return stale immediately and kick a background refresh (deduplicated by in-flight map).
 *   - invalidate(prefix): drops all keys starting with prefix ('' clears all), then kicks
 *     a background refresh for each dropped key (using stored fetcher) so subscribers receive
 *     the fresh value via notifySubscribers.
 *   - subscribe(prefix, cb): returns unsubscribe fn; cb(newValue) called after any background
 *     refresh completes for a key matching prefix.
 *   - _clearForTests(): resets all state (test-only).
 *   - _configure({ maxEntries }): set eviction cap (default 200, evicts oldest-inserted).
 */

interface CacheEntry<T> {
  value: T
  at: number          // insertion timestamp (ms)
  insertOrder: number // monotonically increasing — used for LRU eviction
}

// ── Module state ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const inFlight = new Map<string, Promise<any>>()
// Store last fetcher per key so invalidate can trigger background refresh + notify
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fetchers = new Map<string, () => Promise<any>>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const subscribers = new Map<string, Set<(value: any) => void>>()

let maxEntries = 200
let insertCounter = 0

// ── Internal helpers ──────────────────────────────────────────────────────────

function evictIfNeeded(): void {
  if (cache.size <= maxEntries) return
  // Find the entry with the lowest insertOrder (oldest-inserted)
  let oldestKey: string | null = null
  let oldestOrder = Infinity
  for (const [key, entry] of cache) {
    if (entry.insertOrder < oldestOrder) {
      oldestOrder = entry.insertOrder
      oldestKey = key
    }
  }
  if (oldestKey !== null) cache.delete(oldestKey)
}

function notifySubscribers(key: string, value: unknown): void {
  for (const [prefix, cbs] of subscribers) {
    if (key.startsWith(prefix)) {
      for (const cb of cbs) cb(value)
    }
  }
}

/**
 * Start a background fetch for key, deduplicated by in-flight map.
 * On success: updates cache, removes in-flight, notifies subscribers.
 * On error: keeps stale value, warns, removes in-flight.
 */
function backgroundFetch<T>(key: string, fetcher: () => Promise<T>): void {
  if (inFlight.has(key)) return // already in flight — deduplicate

  const promise = fetcher().then(
    (value: T) => {
      cache.set(key, { value, at: Date.now(), insertOrder: ++insertCounter })
      evictIfNeeded()
      inFlight.delete(key)
      notifySubscribers(key, value)
      return value
    },
    (err: unknown) => {
      console.warn(`[queryCache] background refresh failed for key="${key}":`, err)
      inFlight.delete(key)
      // Bump the `at` timestamp so the stale entry is treated as fresh for the
      // next TTL window — prevents an infinite SWR loop when the network is down.
      const existing = cache.get(key)
      if (existing) {
        cache.set(key, { ...existing, at: Date.now() })
      }
    }
  )
  inFlight.set(key, promise)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch or return cached value. SWR semantics:
 *   - Miss: call fetcher, store, return value.
 *   - Fresh hit (age <= ttlMs): return immediately.
 *   - Stale hit (age > ttlMs): return stale immediately + start background refresh.
 *   - Concurrent same-key miss: deduplicated via in-flight map.
 */
export async function cachedQuery<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  // Always store the fetcher so invalidate can trigger refresh + notify
  fetchers.set(key, fetcher)

  const now = Date.now()
  const entry = cache.get(key) as CacheEntry<T> | undefined

  if (entry !== undefined) {
    const age = now - entry.at
    if (age <= ttlMs) {
      // Fresh — return immediately
      return entry.value
    }
    // Stale — return stale, kick background refresh
    backgroundFetch(key, fetcher)
    return entry.value
  }

  // Miss — check in-flight first to deduplicate concurrent callers
  if (inFlight.has(key)) {
    return inFlight.get(key) as Promise<T>
  }

  // Fresh initial fetch
  const promise = fetcher().then(
    (value: T) => {
      cache.set(key, { value, at: Date.now(), insertOrder: ++insertCounter })
      evictIfNeeded()
      inFlight.delete(key)
      return value
    },
    (err: unknown) => {
      inFlight.delete(key)
      throw err
    }
  )
  inFlight.set(key, promise)
  return promise
}

/**
 * Invalidate all cache keys starting with prefix. Pass '' to clear everything.
 *
 * For each invalidated key that has a stored fetcher:
 *   - Drops the cache entry.
 *   - Kicks a background refresh so subscribers get the fresh value via notifySubscribers.
 *
 * If no fetcher is stored for an invalidated key, the entry is just dropped.
 */
export function invalidate(prefix: string): void {
  const keysToDelete: string[] = []
  for (const key of cache.keys()) {
    if (prefix === '' || key.startsWith(prefix)) keysToDelete.push(key)
  }
  // Also check fetchers map for keys that might be in-flight or just not cached
  if (prefix !== '') {
    for (const key of fetchers.keys()) {
      if (key.startsWith(prefix) && !keysToDelete.includes(key)) {
        keysToDelete.push(key)
      }
    }
  } else {
    for (const key of fetchers.keys()) {
      if (!keysToDelete.includes(key)) keysToDelete.push(key)
    }
  }

  for (const key of keysToDelete) {
    cache.delete(key)
    const fetcher = fetchers.get(key)
    if (fetcher) {
      backgroundFetch(key, fetcher)
    }
  }
}

/**
 * Subscribe to notifications for keys matching prefix.
 * cb(newValue) is called after a background refresh completes for any matching key.
 * Returns an unsubscribe function.
 */
export function subscribe(prefix: string, cb: (value: unknown) => void): () => void {
  if (!subscribers.has(prefix)) {
    subscribers.set(prefix, new Set())
  }
  subscribers.get(prefix)!.add(cb)
  return () => {
    subscribers.get(prefix)?.delete(cb)
  }
}

/** Reset all module state. Test-only. */
export function _clearForTests(): void {
  cache.clear()
  inFlight.clear()
  fetchers.clear()
  subscribers.clear()
  insertCounter = 0
}

/** Configure cache behaviour. Can be called at app init or in tests. */
export function _configure(opts: { maxEntries?: number }): void {
  if (opts.maxEntries !== undefined) maxEntries = opts.maxEntries
}
