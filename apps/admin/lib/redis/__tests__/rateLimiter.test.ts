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

// CRITICAL: wrap getRedis in vi.fn() so tests can re-mock its return value
const fakeRedisClient = {
  pipeline: () => mockPipeline,
  zrange: (...args: any[]) => mockZrange(args[0]),
}
vi.mock('../client', () => ({
  getRedis: vi.fn(() => fakeRedisClient),
}))

import { checkAndIncrementRate } from '../rateLimiter'
import { getRedis } from '../client'

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  // Restore default implementation after clearAllMocks wipes it
  vi.mocked(getRedis).mockImplementation(() => fakeRedisClient as any)
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
    vi.mocked(getRedis).mockReturnValueOnce(null as any)
    const result = await checkAndIncrementRate('test', { max: 1, windowSec: 60 })
    expect(result.allowed).toBe(true)
  })
})
