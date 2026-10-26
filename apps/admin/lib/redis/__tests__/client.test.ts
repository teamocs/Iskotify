import { describe, it, expect, vi, beforeEach } from 'vitest'

const ctor = vi.fn()
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(opts: unknown) { ctor(opts) }
  },
}))

describe('getRedis', () => {
  beforeEach(() => {
    vi.resetModules()
    ctor.mockClear()
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.upstash.io'
    process.env.UPSTASH_REDIS_REST_TOKEN = 't'
  })

  // An unreachable Redis (e.g. a deleted database) must fail fast: the default
  // 5 retries with backoff stalled every request ~24s in production.
  it('caps retries so an outage fails fast', async () => {
    const { getRedis } = await import('../client')
    getRedis()
    const { retry } = ctor.mock.calls[0]![0] as { retry?: false | { retries?: number } }
    expect(retry).toBeDefined()
    expect(retry === false || (retry!.retries ?? 5) <= 1).toBe(true)
  })
})
