# Upstash Redis + Next.js Cache Layer — Design

**Date:** 2026-05-30
**Author:** session brainstorming with user
**Scope:** Targeted caching where it produces real cost or latency wins. Mobile is intentionally untouched — its local-SQLite-on-launch sync model already serves as its cache.

## 1. Goal

Add a thin, targeted caching layer to Iskotify that:

1. **Cuts Google Places API spend** by deduplicating school-search autocomplete across users (a paid API hit on every keystroke today).
2. **Replaces the per-process Gemini rate-limit hack** (`await sleep(170)`) with a real cross-instance rate limiter so admin Vercel functions can't exceed Gemini's 15 rpm quota when multiple admins enhance topics simultaneously.
3. **Accelerates the three hottest admin GETs** (`/api/admin/listings`, `/api/flashcards/drafts`, `/api/flashcards/subjects/[id]/cards`) using Next.js's built-in `unstable_cache` with tag-based invalidation — no Redis needed for these.

Mobile reads, the local Gemma chat pipeline, and `flashcards.ai_options` (the existing DB-as-cache for per-card distractors) are explicitly out of scope — they're already well-cached for their workload.

## 2. Why this scope, not "Redis everywhere"

Survey findings:

| Area | Existing mechanism | Verdict |
|---|---|---|
| Mobile reads (cards, listings, subjects) | Synced to local SQLite on app launch | Already robust — Redis adds nothing |
| Mobile Kuya chat | Local Gemma 3.1B GGUF, 60s context idle release | Already cached on-device |
| Mobile FTS5 retrieval | Local SQLite BM25 | Fast, on-device |
| Gemini distractors per card | Persisted to `flashcards.ai_options` | DB *is* the cache; in-process dedup is rare since questions usually unique |
| Google Places autocomplete | Direct mobile → Places (paid, no cache) | **Real gap** |
| Gemini global rate limit | In-process `sleep(170)` only | **Breaks under concurrent admin sessions** |
| Admin `/api/*` GETs | None (fresh DB query every call) | **Hot enough to warrant Next.js cache, not Redis** |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Mobile (Expo)                                               │
│                                                              │
│  useSchoolSearch ──► (new) admin /api/places/school-search  │
│                                                              │
│  Everything else: local SQLite (unchanged)                  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼ HTTPS
┌─────────────────────────────────────────────────────────────┐
│  Admin (Next.js 15 on Vercel)                                │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/places/school-search   ──► Redis GET cached?    │   │
│  │                                  │  hit → return     │   │
│  │                                  │  miss → Google    │   │
│  │                                  │       Places API  │   │
│  │                                  │       SET ttl=30d │   │
│  │                                  ▼                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/flashcards/distractors                          │   │
│  │ /api/flashcards/enhance-batch  ──► checkRate()       │   │
│  │ /api/flashcards/generate            (Redis sliding   │   │
│  │                                      window, 14/min) │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ /api/admin/listings           ┐                      │   │
│  │ /api/flashcards/drafts        ├ Next.js              │   │
│  │ /api/flashcards/subjects/.../cards ┘ unstable_cache  │   │
│  │                                       + tags         │   │
│  │ Mutations call revalidateTag()                       │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  ┌───────────────┐         ┌──────────────────┐
                  │  Upstash      │         │  Supabase        │
                  │  Redis (REST) │         │  Postgres        │
                  └───────────────┘         └──────────────────┘
```

## 4. Components

### Component 1 — Upstash wiring

**Files:**
- `apps/admin/lib/redis/client.ts` — singleton `@upstash/redis` REST client.
- `apps/admin/lib/redis/keys.ts` — namespaced key builders so we never spell keys inline.
- `apps/admin/lib/redis/__tests__/client.test.ts` — smoke test the client throws if env vars missing.

**Env vars** (Vercel + `.env.local`):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Both server-only. **Never** added to mobile env or `NEXT_PUBLIC_*`.

**Package**: `@upstash/redis@^1.34.0` (Vercel/edge-compatible, no native deps).

**Key prefix scheme** (`keys.ts`):
```ts
export const RedisKey = {
  places: (lang: string, normalized: string) => `places:school:v1:${lang}:${normalized}`,
  rateGemini: () => `rate:gemini:global:v1`,
  cacheHit: (prefix: string) => `cache:hits:${prefix}:30d`,
  cacheMiss: (prefix: string) => `cache:misses:${prefix}:30d`,
}
```

Versioned (`v1`) so we can rotate a schema later without colliding with old entries.

### Component 2 — Places autocomplete proxy with cache

**New route**: `GET /api/places/school-search`

Query params:
- `q` (required, string, 1–80 chars after trim)
- `lang` (optional, `en` or `fil`, default `en`)
- `region` (optional, default `ph`)

Response: same JSON shape that mobile's current direct call to `https://places.googleapis.com/v1/places:autocomplete` returns, so [useSchoolSearch.ts](apps/mobile/hooks/useSchoolSearch.ts) only needs to swap the URL.

Behavior:
1. Normalize `q`: lowercase + trim + collapse whitespace.
2. If normalized `q.length < 2`, return `{ suggestions: [] }` without calling Redis or Places.
3. Build key via `RedisKey.places(lang, normalized)`.
4. Try `redis.get(key)`. Hit → return the cached body, increment `cache:hits:places`.
5. Miss → call Google Places `:autocomplete` server-side using `GOOGLE_PLACES_SERVER_KEY` (new server-only env var; can be the existing key with IP allowlist on Vercel egress, OR a fresh key). Cache the body with `EX = 30 days`. Increment `cache:misses:places`. Return.

Failure handling: if Redis is unreachable, fall through to Google Places directly and log a warning. Cache is never required for correctness.

**Mobile change**: [apps/mobile/hooks/useSchoolSearch.ts](apps/mobile/hooks/useSchoolSearch.ts)
- Replace direct `https://places.googleapis.com/...` fetch with `https://iskotify.vercel.app/api/places/school-search?...` (base URL from `EXPO_PUBLIC_ADMIN_BASE_URL`).
- Drop the `X-Ios-Bundle-Identifier` / `X-Android-Package` headers — they're no longer needed since the request hits our server, not Google directly.
- Keep the 300ms debounce.
- Existing tests in `apps/mobile/hooks/__tests__/useSchoolSearch.test.ts` (if any) get updated to mock the new URL.

**Cache TTL choice**: 30 days. School names + their Place IDs are very stable. Worst case: a new school opens and admins wait a month to see it in autocomplete — acceptable trade for cost reduction.

### Component 3 — Distributed Gemini rate limiter

**File**: `apps/admin/lib/redis/rateLimiter.ts`

```ts
export interface RateCheckResult {
  allowed: boolean
  remaining: number       // requests left in current window
  retryAfterMs?: number   // populated when !allowed
}

export async function checkAndIncrementRate(
  bucket: string,        // e.g. 'gemini:global'
  opts: { max: number; windowSec: number },
): Promise<RateCheckResult>
```

Implementation: sliding-window counter using a Redis sorted set keyed by `rate:${bucket}:v1`. Each request adds `now` as both score and member; we trim entries older than `now - windowSec`, then `ZCARD` to get the count.

Pseudocode:
```ts
const key = RedisKey.rateGemini()
const now = Date.now()
const cutoff = now - opts.windowSec * 1000
const pipeline = redis.pipeline()
pipeline.zremrangebyscore(key, 0, cutoff)
pipeline.zadd(key, { score: now, member: `${now}:${Math.random()}` })
pipeline.zcard(key)
pipeline.expire(key, opts.windowSec + 5)
const [, , count] = await pipeline.exec()
if (count > opts.max) {
  const oldest = await redis.zrange(key, 0, 0, { withScores: true })
  const oldestScore = oldest[1] as number
  return { allowed: false, remaining: 0, retryAfterMs: oldestScore + opts.windowSec * 1000 - now }
}
return { allowed: true, remaining: opts.max - count }
```

**Bucket**: `'gemini:global'` with `max: 14, windowSec: 60`. Gemini free tier is 15 rpm; we leave 1 rpm headroom for retries.

**Wire-in points** (replace existing `await sleep(170)`):
- `apps/admin/lib/gemini/generateDistractors.ts` — before each `model.generateContent()` call, `await waitForRateAllow('gemini:global', { max: 14, windowSec: 60 })`. `waitForRateAllow` is a thin helper that loops with backoff until `allowed: true`.
- `apps/admin/app/api/flashcards/enhance-batch/route.ts` — the per-card loop drops its hand-rolled `await new Promise(r => setTimeout(r, RATE_DELAY_MS))` since the rate limiter handles pacing now.

**Failure handling**: if Redis is unreachable, log + fall back to in-process `await sleep(170)` (current behavior). Never block the user — rate-limit overage means Gemini might 429, which is recoverable.

### Component 4 — Next.js `unstable_cache` on three hot admin GETs

No Redis. Pure Next.js feature.

**Route 1**: `apps/admin/app/api/admin/listings/route.ts` (GET)
- Wrap the Supabase query in `unstable_cache(fn, ['admin-listings'], { tags: ['listings'], revalidate: 300 })` (5 min)
- Invalidation: `revalidateTag('listings')` in the PATCH/DELETE handlers for listings + the sheets sync route + the `/admin/listings` server actions.

**Route 2**: `apps/admin/app/api/flashcards/drafts/route.ts` (GET)
- Wrap in `unstable_cache(fn, ['flashcards-drafts'], { tags: ['drafts'], revalidate: 30 })` (30 sec — drafts page polls every 5s, so worst-case staleness is 30s)
- Invalidation: `revalidateTag('drafts')` in `/api/flashcards/import-csv`, `/api/flashcards/publish/[topicId]`, `/api/flashcards/enhance-batch` (on completion).

**Route 3**: `apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts` (GET)
- Wrap in `unstable_cache(fn, ['subject-cards', id], { tags: [`subject-cards:${id}`, 'subject-cards'], revalidate: 120 })` (2 min)
- Invalidation: `revalidateTag(`subject-cards:${id}`)` in `/api/flashcards/cards` POST/PATCH/DELETE (when we can detect the parent subject).

**Why not Redis for these**: free, zero infra, automatic across all Vercel deployments, tag-based invalidation is precise. Redis would cost money for no measurable benefit at this app's traffic level.

### Component 5 — Observability hooks (Phase 1: counters only)

- Hit/miss counters incremented from inside the cache helpers — no separate admin page in this spec (Phase 2 idea).
- Counters expire after 30 days (`EX = 2592000`), so we can later add an admin page that reads `cache:hits:places:30d` / `cache:misses:places:30d` and shows a hit-rate %.

## 5. Code paths to add/modify

### New files

```
apps/admin/lib/redis/client.ts                                 # Upstash singleton
apps/admin/lib/redis/keys.ts                                   # key builders
apps/admin/lib/redis/rateLimiter.ts                            # sliding-window
apps/admin/lib/redis/__tests__/client.test.ts                  # init smoke test
apps/admin/lib/redis/__tests__/rateLimiter.test.ts             # window math
apps/admin/lib/places/searchSchools.ts                         # places API wrapper
apps/admin/lib/places/__tests__/searchSchools.test.ts
apps/admin/app/api/places/school-search/route.ts               # the proxy route
apps/admin/app/api/places/school-search/__tests__/route.test.ts
```

### Modified files

```
apps/admin/package.json                                         # + @upstash/redis
apps/admin/lib/gemini/generateDistractors.ts                    # use rateLimiter
apps/admin/app/api/flashcards/enhance-batch/route.ts            # drop sleep(170), add revalidateTag('drafts')
apps/admin/app/api/flashcards/import-csv/route.ts               # revalidateTag('drafts')
apps/admin/app/api/flashcards/publish/[topicId]/route.ts        # revalidateTag('drafts'), revalidateTag('subject-cards')
apps/admin/app/api/admin/listings/route.ts                      # unstable_cache wrap
apps/admin/app/admin/listings/actions.ts                        # already calls revalidatePath; add revalidateTag('listings')
apps/admin/app/api/flashcards/drafts/route.ts                   # unstable_cache wrap
apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts      # unstable_cache wrap
apps/mobile/hooks/useSchoolSearch.ts                            # swap URL to admin proxy
apps/mobile/hooks/__tests__/useSchoolSearch.test.ts             # if exists, update mocks
.env.example (admin)                                            # document new env vars
```

### Vercel env vars (manual setup, not in code)

```
UPSTASH_REDIS_REST_URL=<from upstash dashboard>
UPSTASH_REDIS_REST_TOKEN=<from upstash dashboard>
GOOGLE_PLACES_SERVER_KEY=<can be existing key with IP allowlist OR new server-side key>
```

### Mobile env var (already exists in pattern, may need to add)

```
EXPO_PUBLIC_ADMIN_BASE_URL=https://iskotify.vercel.app
```

## 6. Testing strategy

### Unit tests

- `rateLimiter.test.ts` — fakes a `Date.now()` clock + mocks redis pipeline; covers within-limit / over-limit / window-rolls-forward.
- `client.test.ts` — initialization, throws on missing env, returns a valid client otherwise.
- `searchSchools.test.ts` — mocks `fetch` to Google Places; covers happy path + empty response + 4xx error.
- `route.test.ts` (places/school-search) — covers cache-hit / cache-miss / Redis-down-fallback / invalid query.

### Integration tests

- `enhance-batch` test extended: dispatch 20 rapid-fire calls with a stubbed Redis; assert the rate limiter actually throttles to 14/min.

### Manual smoke tests

1. Hit `/api/places/school-search?q=ateneo` twice; second call returns same body 10× faster.
2. From mobile dev build, type "ateneo" in school picker; verify network tab shows admin URL not Google's.
3. Trigger `/api/flashcards/enhance-batch` for a 20-card topic while watching Upstash dashboard — verify rate-limit counter climbs to 14 then plateaus.
4. Edit a listing in admin → verify `/api/admin/listings` returns the updated row immediately (tag invalidation worked).

## 7. Failure modes & fallbacks

- **Redis unreachable**: every cache helper has a try/catch that logs + falls through to the uncached path. Caching is never on the critical path for correctness.
- **Upstash quota exceeded**: free tier is 10k commands/day. Our worst case (Places: ~1 req per debounced keystroke; admin polling: ~12 req/min × 4 admins × 8 hrs = 23k/day for the drafts poll alone) means we should monitor. If we burst past 10k, upgrade to paid tier (~$10/mo) or move admin polling to Next.js cache (which is what Component 4 already does).
- **Google Places key rotation**: server-side key separate from mobile-side bundle-restricted key, so rotating one doesn't affect the other.
- **Cache stampede on miss** (multiple admin sessions hit the same uncached key): not addressed in v1; Component 4's `unstable_cache` deduplicates within a single Vercel function instance, which is good enough at our scale.

## 8. Out of scope (v2 candidates)

- Admin `/admin/cache-stats` page showing hit ratios (counters are written, the page is deferred)
- Caching Gemini distractor responses by content-hash (only worthwhile if duplicate questions become common)
- Migrating the admin's sheets sync to Redis-backed background queue
- Adding a `revalidate` button to the admin UI for manual cache flush
- Redis-based session store (Next.js + Supabase already handle this)
- Caching mobile API responses (mobile already uses local SQLite — Redis adds nothing)
