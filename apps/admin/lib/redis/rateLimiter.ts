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
