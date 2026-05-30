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
