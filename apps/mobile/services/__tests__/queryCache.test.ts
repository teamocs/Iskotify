/**
 * Task 1.1 — TDD failing tests for services/queryCache.ts
 *
 * Tests: fresh hit caches; TTL expiry → SWR (stale + background refresh);
 * miss fetches+stores; concurrent same-key → fetcher runs once;
 * invalidate(prefix) drops keys + notifies; max-entries eviction via _configure;
 * invalidate('') clears all.
 *
 * Uses Jest fake timers for TTL/SWR assertions.
 * TICK flushes the microtask queue by chaining resolved promises.
 */

import {
  cachedQuery,
  invalidate,
  subscribe,
  _clearForTests,
  _configure,
} from '../queryCache'

/** Flush pending microtasks without relying on setImmediate (works with fake timers). */
const TICK = () => Promise.resolve().then(() => Promise.resolve()).then(() => Promise.resolve())

beforeEach(() => {
  _clearForTests()
  _configure({ maxEntries: 200 })
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

// ── 1. Fresh hit: returns cached value without re-calling fetcher ─────────────

describe('cachedQuery — fresh hit', () => {
  it('returns cached value on second call without re-invoking fetcher', async () => {
    const fetcher = jest.fn().mockResolvedValue('hello')
    const first = await cachedQuery('key:1', 30_000, fetcher)
    const second = await cachedQuery('key:1', 30_000, fetcher)
    expect(first).toBe('hello')
    expect(second).toBe('hello')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

// ── 2. Miss: fetches + stores ─────────────────────────────────────────────────

describe('cachedQuery — miss', () => {
  it('calls fetcher on first access and returns the value', async () => {
    const fetcher = jest.fn().mockResolvedValue(42)
    const result = await cachedQuery('key:miss', 10_000, fetcher)
    expect(result).toBe(42)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

// ── 3. SWR: stale returned immediately, background refresh fires once ─────────

describe('cachedQuery — SWR on TTL expiry', () => {
  it('returns stale value immediately then calls fetcher once in background', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('stale-value')
      .mockResolvedValueOnce('fresh-value')

    // Prime the cache
    const first = await cachedQuery('key:swr', 1_000, fetcher)
    expect(first).toBe('stale-value')
    expect(fetcher).toHaveBeenCalledTimes(1)

    // Advance past TTL
    jest.advanceTimersByTime(2_000)

    // Should return stale immediately
    const second = await cachedQuery('key:swr', 1_000, fetcher)
    expect(second).toBe('stale-value')

    // Let background fetch resolve
    await TICK()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('notifies subscribers after background refresh completes', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('stale')
      .mockResolvedValueOnce('fresh')

    await cachedQuery('key:notify', 1_000, fetcher)

    const cb = jest.fn()
    const unsub = subscribe('key:', cb)

    // Expire TTL
    jest.advanceTimersByTime(2_000)
    // Trigger SWR read
    await cachedQuery('key:notify', 1_000, fetcher)
    // Let background resolve
    await TICK()

    expect(cb).toHaveBeenCalledWith('fresh')
    unsub()
  })

  it('deduplicates concurrent background fetches (fetcher runs once)', async () => {
    let resolveBackground!: (v: string) => void
    const fetcher = jest.fn()
      .mockResolvedValueOnce('v1')
      .mockImplementation(() => new Promise<string>(r => { resolveBackground = r }))

    await cachedQuery('key:dedup', 1_000, fetcher)
    jest.advanceTimersByTime(2_000)

    // Trigger two concurrent SWR reads
    const [a, b] = await Promise.all([
      cachedQuery('key:dedup', 1_000, fetcher),
      cachedQuery('key:dedup', 1_000, fetcher),
    ])
    // Both return stale immediately
    expect(a).toBe('v1')
    expect(b).toBe('v1')

    // Background fetch fired exactly once (deduped)
    // Resolve the background promise
    resolveBackground('v2')
    await TICK()

    // fetcher called exactly twice: once initial, once background
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

// ── 4. Background error: keeps stale, warns ──────────────────────────────────

describe('cachedQuery — background error keeps stale', () => {
  it('keeps stale value when background refresh throws', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('stale-ok')
      .mockRejectedValueOnce(new Error('network failure'))

    await cachedQuery('key:err', 1_000, fetcher)
    jest.advanceTimersByTime(2_000)

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const val = await cachedQuery('key:err', 1_000, fetcher)
    expect(val).toBe('stale-ok')

    // Let background rejection settle
    await TICK()

    // Stale value persists in cache after error
    const next = await cachedQuery('key:err', 1_000, fetcher)
    expect(next).toBe('stale-ok')
    warnSpy.mockRestore()
  })
})

// ── 5. invalidate(prefix) — drops matching keys + notifies ───────────────────

describe('invalidate', () => {
  it('invalidates all keys matching prefix', async () => {
    const fetcherA = jest.fn().mockResolvedValueOnce('a1').mockResolvedValueOnce('a2')
    const fetcherB = jest.fn().mockResolvedValue('b1')

    await cachedQuery('home:stats', 30_000, fetcherA)
    await cachedQuery('practice:data:slug', 30_000, fetcherB)
    expect(fetcherA).toHaveBeenCalledTimes(1)
    expect(fetcherB).toHaveBeenCalledTimes(1)

    // Invalidate only 'home:' prefix
    invalidate('home:')

    // home:stats invalidated → fetcher re-runs
    await cachedQuery('home:stats', 30_000, fetcherA)
    expect(fetcherA).toHaveBeenCalledTimes(2)

    // practice:data:slug NOT invalidated → fetcher not re-run
    await cachedQuery('practice:data:slug', 30_000, fetcherB)
    expect(fetcherB).toHaveBeenCalledTimes(1)
  })

  it('notifies subscribers for matching prefix on invalidate', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('old')
      .mockResolvedValueOnce('new')

    await cachedQuery('home:stats', 30_000, fetcher)

    const cb = jest.fn()
    const unsub = subscribe('home:', cb)

    // invalidate triggers background fetch → notifySubscribers
    invalidate('home:')
    // Let background refresh resolve
    await TICK()

    expect(cb).toHaveBeenCalledWith('new')
    unsub()
  })

  it('invalidate("") clears ALL keys', async () => {
    const fetcherA = jest.fn().mockResolvedValue('a')
    const fetcherB = jest.fn().mockResolvedValue('b')

    await cachedQuery('home:stats', 30_000, fetcherA)
    await cachedQuery('analytics:slug', 30_000, fetcherB)

    invalidate('')

    // Both must re-fetch
    await cachedQuery('home:stats', 30_000, fetcherA)
    await cachedQuery('analytics:slug', 30_000, fetcherB)
    // Allow background fetches from invalidate to settle (they count too)
    await TICK()

    expect(fetcherA).toHaveBeenCalledTimes(2)
    expect(fetcherB).toHaveBeenCalledTimes(2)
  })
})

// ── 6. subscribe / unsubscribe ────────────────────────────────────────────────

describe('subscribe', () => {
  it('returns an unsubscribe function that stops notifications', async () => {
    const fetcher = jest.fn()
      .mockResolvedValueOnce('v1')
      .mockResolvedValueOnce('v2')

    await cachedQuery('analytics:foo', 30_000, fetcher)

    const cb = jest.fn()
    const unsub = subscribe('analytics:', cb)
    unsub() // immediately unsubscribe before anything fires

    invalidate('analytics:')
    await TICK()

    expect(cb).not.toHaveBeenCalled()
  })
})

// ── 7. max-entries eviction ───────────────────────────────────────────────────

describe('_configure — max-entries eviction', () => {
  it('evicts oldest entries when cap is exceeded', async () => {
    _configure({ maxEntries: 3 })

    const make = (v: string) => jest.fn().mockResolvedValue(v)
    const f1 = make('v1')
    const f2 = make('v2')
    const f3 = make('v3')
    const f4 = make('v4')

    // Insert 3 entries (at cap)
    await cachedQuery('k1', 60_000, f1)
    await cachedQuery('k2', 60_000, f2)
    await cachedQuery('k3', 60_000, f3)

    // Inserting k4 evicts k1 (oldest-inserted)
    await cachedQuery('k4', 60_000, f4)

    // k1 is gone → fetcher must re-run (2nd call)
    await cachedQuery('k1', 60_000, f1)
    expect(f1).toHaveBeenCalledTimes(2)

    // k3, k4 are still among the newest slots; just assert they're still cached
    await cachedQuery('k3', 60_000, f3)
    await cachedQuery('k4', 60_000, f4)
    expect(f3).toHaveBeenCalledTimes(1)
    expect(f4).toHaveBeenCalledTimes(1)
  })
})

// ── 8. Concurrent same-key during initial fetch ───────────────────────────────

describe('cachedQuery — concurrent same-key during initial fetch', () => {
  it('deduplicates concurrent fetches for the same key when no cache yet', async () => {
    let resolveIt!: (v: string) => void
    const fetcher = jest.fn().mockImplementation(
      () => new Promise<string>(r => { resolveIt = r })
    )

    const p1 = cachedQuery('concurrent:key', 30_000, fetcher)
    const p2 = cachedQuery('concurrent:key', 30_000, fetcher)

    resolveIt('shared-value')
    jest.runAllTimers()

    const [r1, r2] = await Promise.all([p1, p2])
    expect(r1).toBe('shared-value')
    expect(r2).toBe('shared-value')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
