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
        void Promise.resolve(redis.incr(RedisKey.cacheHit('places'))).catch(() => {})
        void Promise.resolve(redis.expire(RedisKey.cacheHit('places'), COUNTER_TTL_SEC)).catch(() => {})
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
    void Promise.resolve(redis.set(key, body, { ex: CACHE_TTL_SEC })).catch(err => {
      console.warn('[places] redis set failed:', err)
    })
    void Promise.resolve(redis.incr(RedisKey.cacheMiss('places'))).catch(() => {})
    void Promise.resolve(redis.expire(RedisKey.cacheMiss('places'), COUNTER_TTL_SEC)).catch(() => {})
  }

  return NextResponse.json(body)
}
