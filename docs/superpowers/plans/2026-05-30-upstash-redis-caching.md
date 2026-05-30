# Upstash Redis + Next.js Cache Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a targeted, low-surface-area caching layer: Upstash Redis for the Google Places autocomplete proxy + distributed Gemini rate limiter, and Next.js `unstable_cache` + `revalidateTag` for the three hottest admin GETs.

**Architecture:** Server-only `@upstash/redis` client in admin (mobile never talks to Redis). New `/api/places/school-search` proxy caches Places responses for 30 days. A sliding-window rate limiter replaces the per-process `sleep(170)` so concurrent admin sessions can't exceed Gemini's 15 rpm quota. Three admin GETs (`/api/admin/listings`, `/api/flashcards/drafts`, `/api/flashcards/subjects/[id]/cards`) wrapped in `unstable_cache` with tag invalidation on mutations — no Redis needed for those.

**Tech Stack:** Next.js 15 App Router · `@upstash/redis` · Vitest (admin) / Jest (mobile) · pnpm monorepo · Supabase (unchanged)

**Spec:** [docs/superpowers/specs/2026-05-30-upstash-redis-caching-design.md](../specs/2026-05-30-upstash-redis-caching-design.md)

**Working directory:** `apps/admin/` for everything except Task 11 (mobile hook swap).

---

## File map

### New files

```
apps/admin/lib/redis/client.ts                                  Upstash singleton
apps/admin/lib/redis/keys.ts                                    namespaced key builders
apps/admin/lib/redis/rateLimiter.ts                             sliding-window counter
apps/admin/lib/redis/__tests__/keys.test.ts
apps/admin/lib/redis/__tests__/rateLimiter.test.ts
apps/admin/lib/places/searchSchools.ts                          Google Places wrapper
apps/admin/lib/places/__tests__/searchSchools.test.ts
apps/admin/app/api/places/school-search/route.ts                proxy route w/ cache
apps/admin/app/api/places/school-search/__tests__/route.test.ts
```

### Modified files

```
apps/admin/package.json                                          + @upstash/redis
apps/admin/.env.example                                          document new env vars
apps/admin/lib/gemini/generateDistractors.ts                     use rateLimiter
apps/admin/app/api/flashcards/enhance-batch/route.ts             drop sleep(170)
apps/admin/app/api/flashcards/import-csv/route.ts                revalidateTag('drafts')
apps/admin/app/api/flashcards/publish/[topicId]/route.ts         revalidateTag('drafts'), revalidateTag(`subject-cards:...`)
apps/admin/app/api/admin/listings/route.ts                       wrap GET in unstable_cache
apps/admin/app/admin/listings/actions.ts                         add revalidateTag('listings')
apps/admin/app/api/admin/listings/[id]/route.ts                  revalidateTag('listings') on PATCH/DELETE
apps/admin/app/api/flashcards/drafts/route.ts                    wrap GET in unstable_cache
apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts       wrap GET in unstable_cache
apps/admin/app/api/flashcards/subjects/[id]/route.ts             revalidateTag(`subject-cards:${id}`, 'listings') on mutations
apps/mobile/hooks/useSchoolSearch.ts                             swap Places URL to admin proxy
apps/mobile/.env.example                                         add EXPO_PUBLIC_ADMIN_BASE_URL
```

---

## Task 1: Add @upstash/redis dependency

**Files:** `apps/admin/package.json`

- [ ] **Step 1: Install**

```bash
cd apps/admin && pnpm add @upstash/redis@1.34.3
```

Expected: `@upstash/redis` appears under `dependencies`, lockfile updates.

- [ ] **Step 2: Type-check**

```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no errors related to the new package (pre-existing backfill test errors are fine).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/package.json pnpm-lock.yaml
git commit -m "chore(admin): add @upstash/redis for caching layer"
```

---

## Task 2: Redis key builders + .env documentation

**Files:**
- Create: `apps/admin/lib/redis/keys.ts`
- Test: `apps/admin/lib/redis/__tests__/keys.test.ts`
- Modify: `apps/admin/.env.example`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/redis/__tests__/keys.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { RedisKey } from '../keys'

describe('RedisKey', () => {
  it('produces stable, versioned place keys', () => {
    expect(RedisKey.places('en', 'ateneo')).toBe('places:school:v1:en:ateneo')
    expect(RedisKey.places('fil', 'pamantasan')).toBe('places:school:v1:fil:pamantasan')
  })

  it('produces stable gemini rate-limit key', () => {
    expect(RedisKey.rateGemini()).toBe('rate:gemini:global:v1')
  })

  it('produces hit/miss counter keys', () => {
    expect(RedisKey.cacheHit('places')).toBe('cache:hits:places:30d')
    expect(RedisKey.cacheMiss('places')).toBe('cache:misses:places:30d')
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/admin && pnpm vitest run lib/redis/__tests__/keys.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/admin/lib/redis/keys.ts`:

```ts
// Namespaced Redis key builders. Always go through these — never inline a key string.
// The `v1` suffix lets us rotate a key schema later (e.g. when the Places response
// shape changes) without colliding with cached entries from the old schema.

export const RedisKey = {
  places: (lang: string, normalized: string) =>
    `places:school:v1:${lang}:${normalized}`,

  rateGemini: () => `rate:gemini:global:v1`,

  cacheHit:  (prefix: string) => `cache:hits:${prefix}:30d`,
  cacheMiss: (prefix: string) => `cache:misses:${prefix}:30d`,
} as const
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/admin && pnpm vitest run lib/redis/__tests__/keys.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Document env vars**

Edit `apps/admin/.env.example`. After the last existing entry, append:

```
# Upstash Redis (server-only — never expose to client or mobile)
# Get from https://console.upstash.com/redis after creating a free database
UPSTASH_REDIS_REST_URL=https://your-db-name.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-token-from-upstash-console

# Google Places API — SERVER-SIDE key (separate from mobile's bundle-ID-restricted key)
# Used by /api/places/school-search proxy. Create in Google Cloud Console and lock to
# Vercel egress IPs OR use HTTP referrer https://iskotify.vercel.app/*
GOOGLE_PLACES_SERVER_KEY=AIza...your-server-key...
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin/lib/redis/keys.ts apps/admin/lib/redis/__tests__/keys.test.ts apps/admin/.env.example
git commit -m "feat(admin/redis): key builders + env var documentation"
```

---

## Task 3: Redis client singleton

**Files:** `apps/admin/lib/redis/client.ts`

- [ ] **Step 1: Implement**

Create `apps/admin/lib/redis/client.ts`:

```ts
import { Redis } from '@upstash/redis'

let cached: Redis | null = null

/**
 * Returns a singleton Upstash Redis client. Returns null if env vars aren't set —
 * callers MUST handle this case by falling through to the uncached path. Caching
 * is never required for correctness.
 */
export function getRedis(): Redis | null {
  if (cached) return cached
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  cached = new Redis({ url, token })
  return cached
}

/**
 * Run `fn` against Redis if available. If Redis is unreachable or env vars are
 * missing, call `fallback()` instead. Errors from `fn` are caught and logged;
 * `fallback()` is invoked on failure too.
 *
 * Use this wrapper anywhere a cache miss should never break the user-facing path.
 */
export async function withRedis<T>(
  fn: (redis: Redis) => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  const redis = getRedis()
  if (!redis) return fallback()
  try {
    return await fn(redis)
  } catch (err) {
    console.warn('[redis] operation failed, falling through:', err)
    return fallback()
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/lib/redis/client.ts
git commit -m "feat(admin/redis): singleton client with graceful fallback wrapper"
```

---

## Task 4: Sliding-window rate limiter

**Files:**
- Create: `apps/admin/lib/redis/rateLimiter.ts`
- Test: `apps/admin/lib/redis/__tests__/rateLimiter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/redis/__tests__/rateLimiter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake Redis for unit testing the windowing logic. The real client is
// covered by integration tests at the API-route layer.
const store = new Map<string, Array<{ score: number; member: string }>>()
const mockPipeline = {
  zremrangebyscore: vi.fn((key: string, _min: number, max: number) => {
    const arr = store.get(key) ?? []
    store.set(key, arr.filter(e => e.score > max))
    return mockPipeline
  }),
  zadd: vi.fn((key: string, entry: { score: number; member: string }) => {
    const arr = store.get(key) ?? []
    arr.push(entry); store.set(key, arr)
    return mockPipeline
  }),
  zcard: vi.fn((_key: string) => mockPipeline),
  expire: vi.fn(() => mockPipeline),
  exec: vi.fn(async () => {
    // Return the zcard result (4th-to-last call in our pipeline ordering)
    const key = (mockPipeline.zadd.mock.calls.at(-1) as any)?.[0]
    const count = (store.get(key) ?? []).length
    return [null, null, count, null]
  }),
}
const mockZrange = vi.fn(async (key: string) => {
  const arr = (store.get(key) ?? []).sort((a, b) => a.score - b.score)
  if (arr.length === 0) return []
  return [arr[0]!.member, arr[0]!.score]
})

vi.mock('../client', () => ({
  getRedis: () => ({
    pipeline: () => mockPipeline,
    zrange: (...args: any[]) => mockZrange(args[0]),
  }),
}))

import { checkAndIncrementRate } from '../rateLimiter'

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
})

describe('checkAndIncrementRate', () => {
  it('allows requests under the limit', async () => {
    const result = await checkAndIncrementRate('test', { max: 3, windowSec: 60 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks requests over the limit', async () => {
    await checkAndIncrementRate('test', { max: 2, windowSec: 60 })
    await checkAndIncrementRate('test', { max: 2, windowSec: 60 })
    const result = await checkAndIncrementRate('test', { max: 2, windowSec: 60 })
    expect(result.allowed).toBe(false)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('returns { allowed: true } when Redis is unavailable', async () => {
    // Re-mock getRedis to null
    const { getRedis } = await import('../client')
    vi.mocked(getRedis).mockReturnValueOnce(null as any)
    const result = await checkAndIncrementRate('test', { max: 1, windowSec: 60 })
    expect(result.allowed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/admin && pnpm vitest run lib/redis/__tests__/rateLimiter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/admin/lib/redis/rateLimiter.ts`:

```ts
import { getRedis } from './client'
import { RedisKey } from './keys'

export interface RateCheckResult {
  allowed: boolean
  remaining: number
  retryAfterMs?: number
}

interface RateOpts {
  max: number          // max requests per window
  windowSec: number    // window length in seconds
}

/**
 * Sliding-window rate limiter using a Redis sorted set. Each call adds `now` as
 * both score and member, trims entries older than `now - windowSec`, then checks
 * the count. Returns { allowed: false, retryAfterMs } when the count exceeds max.
 *
 * Bucket maps to a Redis key via RedisKey.{rateGemini,...}. New buckets need a
 * new RedisKey entry — never spell keys inline at call sites.
 */
export async function checkAndIncrementRate(
  bucket: 'gemini:global' | string,
  opts: RateOpts,
): Promise<RateCheckResult> {
  const redis = getRedis()
  if (!redis) {
    // No Redis? Optimistically allow. The in-process sleep() fallback in the
    // caller keeps us roughly safe under low concurrency.
    return { allowed: true, remaining: opts.max }
  }

  const key = bucket === 'gemini:global' ? RedisKey.rateGemini() : `rate:${bucket}:v1`
  const now = Date.now()
  const cutoff = now - opts.windowSec * 1000

  try {
    const pipeline = redis.pipeline()
    pipeline.zremrangebyscore(key, 0, cutoff)
    pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
    pipeline.zcard(key)
    pipeline.expire(key, opts.windowSec + 5)
    const results = await pipeline.exec()
    const count = (results[2] as number) ?? 0

    if (count > opts.max) {
      // Find the oldest entry in the current window — that determines when we'd be allowed again
      const oldest = await redis.zrange(key, 0, 0, { withScores: true })
      const oldestScore = typeof oldest[1] === 'number' ? oldest[1] : now
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, oldestScore + opts.windowSec * 1000 - now),
      }
    }

    return { allowed: true, remaining: Math.max(0, opts.max - count) }
  } catch (err) {
    console.warn('[rateLimiter] redis error, allowing:', err)
    return { allowed: true, remaining: opts.max }
  }
}

/**
 * Block until the rate limiter allows another request. Sleeps in 100ms steps
 * with a hard cap at `maxWaitMs` so a runaway never blocks forever.
 */
export async function waitForRateAllow(
  bucket: string,
  opts: RateOpts,
  maxWaitMs = 30_000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs
  while (Date.now() < deadline) {
    const r = await checkAndIncrementRate(bucket, opts)
    if (r.allowed) return
    const wait = Math.min(r.retryAfterMs ?? 1000, deadline - Date.now())
    if (wait <= 0) return
    await new Promise(res => setTimeout(res, wait))
  }
  // Hit the cap — return anyway so caller proceeds. Worst case: Gemini 429s.
  console.warn('[rateLimiter] hit maxWaitMs cap, proceeding')
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/admin && pnpm vitest run lib/redis/__tests__/rateLimiter.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/redis/rateLimiter.ts apps/admin/lib/redis/__tests__/rateLimiter.test.ts
git commit -m "feat(admin/redis): sliding-window rate limiter for cross-instance throttling"
```

---

## Task 5: Google Places search helper

**Files:**
- Create: `apps/admin/lib/places/searchSchools.ts`
- Test: `apps/admin/lib/places/__tests__/searchSchools.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/lib/places/__tests__/searchSchools.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { searchSchools, type PlacesSchoolResult } from '../searchSchools'

beforeEach(() => { mockFetch.mockReset() })

describe('searchSchools', () => {
  it('returns mapped suggestions on a successful response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        suggestions: [
          {
            placePrediction: {
              structuredFormat: {
                mainText: { text: 'Ateneo de Manila University' },
                secondaryText: { text: 'Loyola Heights, Quezon City, Philippines' },
              },
            },
          },
        ],
      }),
    })

    const results = await searchSchools('ateneo', { apiKey: 'test-key' })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject<PlacesSchoolResult>({
      name: 'Ateneo de Manila University',
      subtitle: 'Loyola Heights, Quezon City, Philippines',
      source: 'places',
    })
  })

  it('returns empty array when API returns no suggestions', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const results = await searchSchools('zzz', { apiKey: 'test-key' })
    expect(results).toEqual([])
  })

  it('throws on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    await expect(searchSchools('x', { apiKey: 'test-key' })).rejects.toThrow(/403/)
  })

  it('sends X-Goog-Api-Key header', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ suggestions: [] }) })
    await searchSchools('x', { apiKey: 'secret-key' })
    const call = mockFetch.mock.calls[0]!
    expect((call[1] as RequestInit).headers).toMatchObject({ 'X-Goog-Api-Key': 'secret-key' })
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/admin && pnpm vitest run lib/places/__tests__/searchSchools.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/admin/lib/places/searchSchools.ts`:

```ts
const PLACES_URL = 'https://places.googleapis.com/v1/places:autocomplete'

export interface PlacesSchoolResult {
  name: string
  subtitle: string
  source: 'places'
}

interface SearchOpts {
  apiKey: string
  region?: string  // ISO 3166-1 alpha-2, default 'ph'
}

/**
 * Call Google Places `:autocomplete` server-side. Returns the same shape that
 * mobile's useSchoolSearch already consumes, so the only mobile change is the
 * URL it fetches.
 *
 * Throws on HTTP non-OK so the proxy route can return a 502 + log the failure.
 */
export async function searchSchools(
  query: string,
  opts: SearchOpts,
): Promise<PlacesSchoolResult[]> {
  const res = await fetch(PLACES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': opts.apiKey,
      'X-Goog-FieldMask': 'suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: query,
      includedPrimaryTypes: ['school', 'secondary_school', 'university'],
      includedRegionCodes: [opts.region ?? 'ph'],
    }),
  })

  if (!res.ok) {
    throw new Error(`Google Places HTTP ${res.status}`)
  }

  const json = await res.json() as {
    suggestions?: Array<{
      placePrediction: {
        structuredFormat: {
          mainText: { text: string }
          secondaryText: { text: string }
        }
      }
    }>
  }

  return (json.suggestions ?? []).map(s => ({
    name: s.placePrediction.structuredFormat.mainText.text,
    subtitle: s.placePrediction.structuredFormat.secondaryText.text,
    source: 'places' as const,
  }))
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/admin && pnpm vitest run lib/places/__tests__/searchSchools.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/places/searchSchools.ts apps/admin/lib/places/__tests__/searchSchools.test.ts
git commit -m "feat(admin/places): server-side Google Places autocomplete wrapper"
```

---

## Task 6: Places school-search proxy route with Redis cache

**Files:**
- Create: `apps/admin/app/api/places/school-search/route.ts`
- Test: `apps/admin/app/api/places/school-search/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/api/places/school-search/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockSet = vi.fn()
const mockIncr = vi.fn()

vi.mock('@/lib/redis/client', () => ({
  getRedis: () => ({
    get: mockGet,
    set: mockSet,
    incr: mockIncr,
    expire: vi.fn(),
  }),
  withRedis: async (fn: any, fallback: any) => {
    try { return await fn({ get: mockGet, set: mockSet, incr: mockIncr, expire: vi.fn() }) }
    catch { return fallback() }
  },
}))

const mockSearchSchools = vi.fn()
vi.mock('@/lib/places/searchSchools', () => ({
  searchSchools: (...args: any[]) => mockSearchSchools(...args),
}))

import { GET } from '../route'

function makeReq(url: string): any {
  return { url, headers: new Headers() }
}

beforeEach(() => {
  mockGet.mockReset(); mockSet.mockReset(); mockIncr.mockReset()
  mockSearchSchools.mockReset()
  process.env.GOOGLE_PLACES_SERVER_KEY = 'test-key'
})

describe('GET /api/places/school-search', () => {
  it('returns 400 when q is missing', async () => {
    const res = await GET(makeReq('http://x/api/places/school-search'))
    expect(res.status).toBe(400)
  })

  it('returns empty suggestions when q is shorter than 2 chars', async () => {
    const res = await GET(makeReq('http://x/api/places/school-search?q=a'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions).toEqual([])
    expect(mockSearchSchools).not.toHaveBeenCalled()
  })

  it('returns cached body on hit without calling Places', async () => {
    mockGet.mockResolvedValueOnce({ suggestions: [{ name: 'Cached U', subtitle: 'x', source: 'places' }] })
    const res = await GET(makeReq('http://x/api/places/school-search?q=ateneo'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0].name).toBe('Cached U')
    expect(mockSearchSchools).not.toHaveBeenCalled()
  })

  it('calls Places on miss, caches the result, and returns it', async () => {
    mockGet.mockResolvedValueOnce(null)
    mockSearchSchools.mockResolvedValueOnce([{ name: 'Fresh U', subtitle: 'x', source: 'places' }])
    const res = await GET(makeReq('http://x/api/places/school-search?q=ateneo'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0].name).toBe('Fresh U')
    expect(mockSet).toHaveBeenCalledTimes(1)
  })

  it('falls through to Places when Redis throws', async () => {
    mockGet.mockRejectedValueOnce(new Error('redis down'))
    mockSearchSchools.mockResolvedValueOnce([{ name: 'Fallback U', subtitle: 'x', source: 'places' }])
    const res = await GET(makeReq('http://x/api/places/school-search?q=ateneo'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suggestions[0].name).toBe('Fallback U')
  })

  it('returns 500 when GOOGLE_PLACES_SERVER_KEY is missing', async () => {
    delete process.env.GOOGLE_PLACES_SERVER_KEY
    mockGet.mockResolvedValueOnce(null)
    const res = await GET(makeReq('http://x/api/places/school-search?q=ateneo'))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/admin && pnpm vitest run app/api/places/school-search/__tests__/route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/admin/app/api/places/school-search/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getRedis } from '@/lib/redis/client'
import { RedisKey } from '@/lib/redis/keys'
import { searchSchools } from '@/lib/places/searchSchools'

export const runtime = 'nodejs'

const CACHE_TTL_SEC = 60 * 60 * 24 * 30   // 30 days
const COUNTER_TTL_SEC = 60 * 60 * 24 * 30 // 30 days
const MIN_QUERY_LEN = 2
const MAX_QUERY_LEN = 80

function normalize(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, MAX_QUERY_LEN)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const rawQ = url.searchParams.get('q')
  const lang = url.searchParams.get('lang') ?? 'en'
  const region = url.searchParams.get('region') ?? 'ph'

  if (rawQ === null) {
    return NextResponse.json({ error: 'q parameter required' }, { status: 400 })
  }
  const normalized = normalize(rawQ)
  if (normalized.length < MIN_QUERY_LEN) {
    return NextResponse.json({ suggestions: [] })
  }

  const apiKey = process.env.GOOGLE_PLACES_SERVER_KEY
  const key = RedisKey.places(lang, normalized)
  const redis = getRedis()

  // 1. Try cache. Any Redis error falls through to the live call.
  if (redis) {
    try {
      const cached = await redis.get<{ suggestions: unknown[] }>(key)
      if (cached) {
        redis.incr(RedisKey.cacheHit('places')).catch(() => {})
        redis.expire(RedisKey.cacheHit('places'), COUNTER_TTL_SEC).catch(() => {})
        return NextResponse.json(cached)
      }
    } catch (err) {
      console.warn('[places] redis get failed, falling through:', err)
    }
  }

  // 2. Cache miss (or no Redis). Need a server key.
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_PLACES_SERVER_KEY not configured' },
      { status: 500 },
    )
  }

  let suggestions: Awaited<ReturnType<typeof searchSchools>>
  try {
    suggestions = await searchSchools(normalized, { apiKey, region })
  } catch (err) {
    console.error('[places] google places call failed:', err)
    return NextResponse.json({ error: 'upstream Places API failed' }, { status: 502 })
  }

  const body = { suggestions }

  // 3. Best-effort cache write + miss counter.
  if (redis) {
    redis.set(key, body, { ex: CACHE_TTL_SEC }).catch(err => {
      console.warn('[places] redis set failed:', err)
    })
    redis.incr(RedisKey.cacheMiss('places')).catch(() => {})
    redis.expire(RedisKey.cacheMiss('places'), COUNTER_TTL_SEC).catch(() => {})
  }

  return NextResponse.json(body)
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/admin && pnpm vitest run app/api/places/school-search/__tests__/route.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Add to middleware operator allowlist? — NO**

This route uses cookie-based admin auth via the middleware. It does NOT bypass auth like operator endpoints do. Verify by NOT touching `apps/admin/middleware.ts`.

Actually wait — the middleware enforces login on `/api/:path*` but the **mobile app** will be calling this endpoint, and mobile users do NOT have admin cookies.

The Places proxy must be reachable by unauthenticated mobile clients. Update the OPERATOR_ENDPOINTS comment + path:

Edit `apps/admin/middleware.ts`:

```ts
// Endpoints that bypass Supabase session auth:
// - Operator endpoints authenticate via x-admin-secret header
// - The Places proxy is called by the mobile app (no admin session)
const OPERATOR_ENDPOINTS = [
  '/api/flashcards/backfill',
  '/api/flashcards/distractors',
  '/api/flashcards/sanitize-legacy',
  '/api/places/school-search',  // mobile-accessible
]
```

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/places/school-search apps/admin/middleware.ts
git commit -m "feat(admin/places): GET /api/places/school-search proxy with 30d Redis cache"
```

---

## Task 7: Wire rate limiter into Gemini distractor generation

**Files:** `apps/admin/lib/gemini/generateDistractors.ts`

- [ ] **Step 1: Read the current file**

```bash
grep -n "generateContent\|sleep\|model\\." apps/admin/lib/gemini/generateDistractors.ts | head -20
```

This task adds rate-limit gating BEFORE each Gemini call. The current file has one `model.generateContent()` call inside `generateDistractorsForCard()`.

- [ ] **Step 2: Add the rate-limit gate**

Edit `apps/admin/lib/gemini/generateDistractors.ts`. At the top of the file, add the import:

```ts
import { waitForRateAllow } from '../redis/rateLimiter'
```

Find the `model.generateContent(...)` call inside `generateDistractorsForCard`. Immediately BEFORE it, add:

```ts
  // Cross-instance rate-limit gate. Replaces the in-process sleep() that used
  // to live in callers — that only worked under a single Vercel function instance.
  await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })
```

- [ ] **Step 3: Type-check**

```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Existing tests still pass**

```bash
cd apps/admin && pnpm vitest run lib/gemini
```

Expected: PASS — the rate limiter falls through to "allowed: true" when Redis env vars aren't set (test env), so existing tests aren't disturbed.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/gemini/generateDistractors.ts
git commit -m "feat(admin/gemini): gate every distractor call through the Redis rate limiter"
```

---

## Task 8: Drop the per-process sleep in enhance-batch

**Files:** `apps/admin/app/api/flashcards/enhance-batch/route.ts`

The rate limiter now lives inside `generateDistractorsForCard`, so the route's `setTimeout(r, RATE_DELAY_MS)` is dead weight.

- [ ] **Step 1: Read the current file**

```bash
grep -n "RATE_DELAY_MS\|setTimeout" apps/admin/app/api/flashcards/enhance-batch/route.ts
```

Note the line numbers.

- [ ] **Step 2: Remove the constant + the sleep**

Edit `apps/admin/app/api/flashcards/enhance-batch/route.ts`:

Delete this line near the top:
```ts
const RATE_DELAY_MS = 170  // ~6 req/sec — under Gemini free-tier 15rpm/1500rpd
```

Delete this line near the bottom of the per-card `for (const card of list)` loop:
```ts
    await new Promise(r => setTimeout(r, RATE_DELAY_MS))
```

Add a one-line comment where the sleep used to be:
```ts
    // Pacing now handled by the Redis rate limiter inside generateDistractorsForCard.
```

- [ ] **Step 3: Type-check**

```bash
cd apps/admin && pnpm exec tsc --noEmit
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/api/flashcards/enhance-batch/route.ts
git commit -m "refactor(admin/enhance-batch): drop per-process sleep, rely on Redis rate limiter"
```

---

## Task 9: unstable_cache + revalidateTag for /api/admin/listings

**Files:**
- Modify: `apps/admin/app/api/admin/listings/route.ts`
- Modify: `apps/admin/app/api/admin/listings/[id]/route.ts`
- Modify: `apps/admin/app/admin/listings/actions.ts`

- [ ] **Step 1: Read the current listings GET**

```bash
grep -n "export\|createServerClient\|from(" apps/admin/app/api/admin/listings/route.ts | head -10
```

- [ ] **Step 2: Wrap the GET handler in unstable_cache**

Edit `apps/admin/app/api/admin/listings/route.ts`. Add to imports at top:

```ts
import { unstable_cache } from 'next/cache'
```

Wrap the body of the GET handler's DB-fetching logic. Concretely: extract the Supabase fetch into a named, cached function and call it from the route. Replace the existing GET handler with:

```ts
const fetchListings = unstable_cache(
  async () => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .order('type')
      .order('title')
    if (error) throw error
    return data ?? []
  },
  ['admin-listings'],
  { tags: ['listings'], revalidate: 300 },
)

export async function GET() {
  try {
    const data = await fetchListings()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Database error' }, { status: 500 })
  }
}
```

(Keep any existing POST/other handlers untouched.)

- [ ] **Step 3: Invalidate on PATCH/DELETE**

Edit `apps/admin/app/api/admin/listings/[id]/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

In the PATCH handler, immediately before `return NextResponse.json(...)` on the success path:

```ts
  revalidateTag('listings')
```

Same in the DELETE handler.

- [ ] **Step 4: Invalidate in server actions**

Edit `apps/admin/app/admin/listings/actions.ts`. The file already imports `revalidatePath`. Add to the same import:

```ts
import { revalidatePath, revalidateTag } from 'next/cache'
```

Find every `revalidatePath('/admin/listings')` call and add a line below it:

```ts
  revalidateTag('listings')
```

- [ ] **Step 5: Verify build + tests**

```bash
cd apps/admin && pnpm exec tsc --noEmit && pnpm test 2>&1 | tail -5
```

Expected: type-check passes; full test suite still green (221 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/admin/listings apps/admin/app/admin/listings/actions.ts
git commit -m "feat(admin/listings): unstable_cache GET + revalidateTag on mutations (5min TTL)"
```

---

## Task 10: unstable_cache + revalidateTag for /api/flashcards/drafts

**Files:**
- Modify: `apps/admin/app/api/flashcards/drafts/route.ts`
- Modify: `apps/admin/app/api/flashcards/import-csv/route.ts`
- Modify: `apps/admin/app/api/flashcards/publish/[topicId]/route.ts`
- Modify: `apps/admin/app/api/flashcards/enhance-batch/route.ts`

- [ ] **Step 1: Wrap the drafts GET**

Edit `apps/admin/app/api/flashcards/drafts/route.ts`. Add to imports:

```ts
import { unstable_cache } from 'next/cache'
```

The route currently does auth + admin-role check inline before the data fetch. Extract the data fetch into a cached function (keep the auth check uncached — auth is per-request):

```ts
const fetchDrafts = unstable_cache(
  async () => {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('flashcard_topics')
      .select(`
        id, name, source_type, created_at,
        flashcard_subjects:flashcard_subjects!subject_id (id, name),
        flashcards (options, ai_options)
      `)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },
  ['flashcards-drafts'],
  { tags: ['drafts'], revalidate: 30 },
)
```

Then replace the route's existing `const { data, error } = await supabase.from('flashcard_topics')...` block (after the auth check) with:

```ts
  let rawTopics: any[]
  try {
    rawTopics = await fetchDrafts()
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Database error' }, { status: 500 })
  }

  const drafts = rawTopics.map((t: any) => {
    // ... existing counter-derivation logic stays unchanged
```

(The counter derivation that follows in the existing code remains identical — only the data fetch is now cached.)

- [ ] **Step 2: Invalidate after CSV import**

Edit `apps/admin/app/api/flashcards/import-csv/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

Immediately before `return NextResponse.json(result)` (the success return at the end of POST):

```ts
  revalidateTag('drafts')
```

- [ ] **Step 3: Invalidate after publish**

Edit `apps/admin/app/api/flashcards/publish/[topicId]/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

Immediately before `return NextResponse.json({ topic_id: topicId, listing_slugs: slugs })`:

```ts
  revalidateTag('drafts')
  revalidateTag(`subject-cards:${topicId}`)
```

- [ ] **Step 4: Invalidate after enhance-batch completes**

Edit `apps/admin/app/api/flashcards/enhance-batch/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

Immediately before the final `return NextResponse.json({ topic_id: topicId, attempted: list.length, enhanced, failed })`:

```ts
  if (enhanced > 0) revalidateTag('drafts')
```

(Only invalidate when we actually wrote something — saves needless invalidation on no-op runs.)

- [ ] **Step 5: Verify**

```bash
cd apps/admin && pnpm exec tsc --noEmit && pnpm test 2>&1 | tail -5
```

Expected: type-check passes, all tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/flashcards/drafts apps/admin/app/api/flashcards/import-csv apps/admin/app/api/flashcards/publish apps/admin/app/api/flashcards/enhance-batch
git commit -m "feat(admin/drafts): unstable_cache GET (30s TTL) + tag invalidation from import/publish/enhance"
```

---

## Task 11: unstable_cache + revalidateTag for subject cards

**Files:**
- Modify: `apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts`
- Modify: `apps/admin/app/api/flashcards/subjects/[id]/route.ts`
- Modify: `apps/admin/app/api/flashcards/cards/route.ts` (POST handler — card creation under a topic)
- Modify: `apps/admin/app/api/flashcards/cards/[id]/route.ts` (PATCH/DELETE)

- [ ] **Step 1: Wrap the subject-cards GET**

Edit `apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts`. Add to imports:

```ts
import { unstable_cache } from 'next/cache'
```

Replace the GET handler with a cached version. The existing handler does:
```ts
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  // ... fetch logic ...
}
```

Rewrite as:

```ts
function buildFetcher(id: string) {
  return unstable_cache(
    async () => {
      const supabase = createServerClient()
      // Paste the existing fetch logic here, but `return` the data instead
      // of building a NextResponse.
      const { data, error } = await supabase
        .from('flashcard_topics')
        .select('id, name, status, flashcards (id, question, answer, explanation, status, listing_slugs, options, correct_answer_index, ai_options, ai_correct_index, ai_explanation, ai_enhanced_at, updated_at)')
        .eq('subject_id', id)
        .order('name')
      if (error) throw error
      return data ?? []
    },
    ['subject-cards', id],
    { tags: [`subject-cards:${id}`, 'subject-cards'], revalidate: 120 },
  )
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const data = await buildFetcher(id)()
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Database error' }, { status: 500 })
  }
}
```

(If the existing select differs from the one above, keep the existing one — what matters is wrapping the fetch in `unstable_cache`.)

- [ ] **Step 2: Invalidate from card mutations**

Edit `apps/admin/app/api/flashcards/cards/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

After both the batch-insert and single-card insert success paths, add:

```ts
  revalidateTag('subject-cards')
  revalidateTag('drafts')
```

(Use the broad `subject-cards` tag since we don't always have the subject id handy — minor over-invalidation is fine.)

Edit `apps/admin/app/api/flashcards/cards/[id]/route.ts`. Add the same import. After PATCH success and DELETE success returns:

```ts
  revalidateTag('subject-cards')
```

- [ ] **Step 3: Invalidate from subject mutations**

Edit `apps/admin/app/api/flashcards/subjects/[id]/route.ts`. Add to imports:

```ts
import { revalidateTag } from 'next/cache'
```

In PATCH (right before the success `return NextResponse.json(data)`):

```ts
  revalidateTag('listings')           // subject listing_slugs affect listing-based queries
  revalidateTag(`subject-cards:${id}`)
```

In DELETE (right before the success `return new NextResponse(null, { status: 204 })`):

```ts
  revalidateTag(`subject-cards:${id}`)
  revalidateTag('drafts')   // deleted subject removes its draft topics from the inbox
```

- [ ] **Step 4: Verify**

```bash
cd apps/admin && pnpm exec tsc --noEmit && pnpm test 2>&1 | tail -5
```

Expected: type-check passes, all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/subjects apps/admin/app/api/flashcards/cards
git commit -m "feat(admin/subject-cards): unstable_cache GET (2min TTL) + tag invalidation from CRUD"
```

---

## Task 12: Swap mobile useSchoolSearch to the admin proxy

**Files:**
- Modify: `apps/mobile/hooks/useSchoolSearch.ts`
- Modify: `apps/mobile/.env.example` (create if not present)

- [ ] **Step 1: Add the env var**

If `apps/mobile/.env.example` exists, add a line. If not, create it with:

```
# Admin API base URL — used by useSchoolSearch to call the cached Places proxy.
# Falls back to https://iskotify.vercel.app when unset.
EXPO_PUBLIC_ADMIN_BASE_URL=https://iskotify.vercel.app
```

- [ ] **Step 2: Modify searchPlaces() to call the proxy**

Edit `apps/mobile/hooks/useSchoolSearch.ts`.

Replace the existing `searchPlaces` function (currently lines ~89-133) with:

```ts
const ADMIN_BASE_URL = process.env.EXPO_PUBLIC_ADMIN_BASE_URL ?? 'https://iskotify.vercel.app'

async function searchPlaces(q: string): Promise<SchoolResult[]> {
  const url = `${ADMIN_BASE_URL}/api/places/school-search?q=${encodeURIComponent(q)}&lang=en&region=ph`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) throw new Error(`Places proxy HTTP ${res.status}`)
  const json = await res.json() as { suggestions?: Array<{ name: string; subtitle: string; source: 'places' }> }
  return json.suggestions ?? []
}
```

Remove the now-unused constants:
- `const PLACES_URL = ...`
- `const PLACES_KEY = ...`
- `const PLACES_KEY_PLACEHOLDER = ...`

And the now-unused `import { Platform } from 'react-native'` (the platform-specific bundle ID headers no longer apply).

- [ ] **Step 3: Update existing tests for the hook**

```bash
ls apps/mobile/hooks/__tests__/useSchoolSearch.test.ts 2>/dev/null && echo "exists" || echo "no test"
```

If the test file exists: edit it. Find the test that asserts `fetch` is called with `'https://places.googleapis.com/v1/places:autocomplete'` and update the expectation to `expect.stringContaining('/api/places/school-search?q=')`. Find any assertions about the request body (POST with JSON) and update to expect a GET (no body).

If the test file does NOT exist: skip this step.

- [ ] **Step 4: Verify**

```bash
cd apps/mobile && pnpm test --testPathPattern useSchoolSearch 2>&1 | tail -10
```

Expected: PASS for the useSchoolSearch tests (or "no tests found" if no test file exists).

Then full mobile suite:

```bash
cd apps/mobile && pnpm test 2>&1 | tail -5
```

Expected: same number passing as before (no new failures from this change).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useSchoolSearch.ts apps/mobile/.env.example
[ -f apps/mobile/hooks/__tests__/useSchoolSearch.test.ts ] && git add apps/mobile/hooks/__tests__/useSchoolSearch.test.ts
git commit -m "feat(mobile/school-search): route Places autocomplete through cached admin proxy"
```

---

## Task 13: Full verification + manual smoke + push

**Files:** none

- [ ] **Step 1: Full admin test + build**

```bash
cd apps/admin && pnpm test 2>&1 | tail -5 && pnpm build 2>&1 | tail -5
```

Expected: 221+ tests passing (we add ~17 new tests across Tasks 2, 4, 5, 6); build clean.

- [ ] **Step 2: Full mobile test**

```bash
cd apps/mobile && pnpm test 2>&1 | tail -5
```

Expected: same passing count as baseline before this work started.

- [ ] **Step 3: Set up Upstash account (manual, one-time)**

This step is for the human operator, NOT a subagent:

1. Go to https://console.upstash.com/redis
2. Create a free database in the region closest to Vercel (likely `us-east-1`)
3. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. Add both to Vercel project env vars (Production + Preview)
5. Create or reuse a Google Cloud API key for Places with HTTP-referrer restriction set to `https://iskotify.vercel.app/*`; add as `GOOGLE_PLACES_SERVER_KEY` in Vercel env vars

Tell the controller (us) once these are set so we can proceed to step 4.

- [ ] **Step 4: Manual smoke tests (after env vars set + Vercel deploys)**

1. Hit the proxy twice from a terminal:
   ```bash
   curl -s 'https://iskotify.vercel.app/api/places/school-search?q=ateneo' | jq '.suggestions[0].name'
   curl -s 'https://iskotify.vercel.app/api/places/school-search?q=ateneo' | jq '.suggestions[0].name'
   ```
   Both should return the same name. The second should feel measurably faster (cache hit).

2. From the mobile dev build, open onboarding → school picker → type "ateneo". Watch network log: requests should go to `iskotify.vercel.app/api/places/school-search?...`, NOT to `places.googleapis.com`.

3. Trigger `/api/flashcards/enhance-batch` for a 20-card topic while watching the Upstash dashboard. The `rate:gemini:global:v1` sorted set should climb to ~14 then plateau as the limiter throttles.

4. Edit a listing in admin (`PATCH /api/admin/listings/[id]`). Refresh the listings page — the change should appear immediately (tag invalidation worked).

- [ ] **Step 5: Push**

```bash
cd "C:\Users\User\OneDrive\Desktop\IskotifyApp" && git push origin master
```

- [ ] **Step 6: Verify Vercel deploy succeeds**

Wait for Vercel to deploy. Check `https://iskotify.vercel.app/api/places/school-search?q=ateneo` returns 200 (will return 500 only if `GOOGLE_PLACES_SERVER_KEY` isn't set yet).

---

## Self-review against the spec

- §3 Architecture diagram — Tasks 1-3 (Upstash wiring), Task 6 (Places proxy), Tasks 7-8 (rate limiter wiring), Tasks 9-11 (Next.js cache) ✓
- §4 Component 1 (Upstash wiring) — Tasks 1, 2, 3 ✓
- §4 Component 2 (Places proxy) — Tasks 5, 6, 12 ✓
- §4 Component 3 (rate limiter) — Tasks 4, 7, 8 ✓
- §4 Component 4 (Next.js cache) — Tasks 9, 10, 11 ✓
- §4 Component 5 (observability counters) — Implemented inline in Task 6 (`cacheHit`/`cacheMiss` counters in the proxy route) ✓
- §5 New files — all 9 covered ✓
- §5 Modified files — all 14 covered ✓
- §6 Testing strategy — Tasks 2, 4, 5, 6 add unit tests; Task 13 covers manual smoke ✓
- §7 Failure modes — `withRedis` wrapper + every route catches Redis errors and falls through ✓
- §8 Out-of-scope items — not in plan (correctly) ✓
