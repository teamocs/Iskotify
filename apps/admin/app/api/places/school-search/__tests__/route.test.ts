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

const mockCheckRate = vi.fn()
vi.mock('@/lib/redis/rateLimiter', () => ({
  checkAndIncrementRate: (...args: any[]) => mockCheckRate(...args),
}))

import { GET } from '../route'

function makeReq(url: string): any {
  return { url, headers: new Headers() }
}

beforeEach(() => {
  mockGet.mockReset(); mockSet.mockReset(); mockIncr.mockReset()
  mockSearchSchools.mockReset()
  mockCheckRate.mockReset()
  // Rate limiter allows by default (mirrors the fail-open real implementation)
  mockCheckRate.mockResolvedValue({ allowed: true, remaining: 30 })
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
    // Cache hits must never consume rate-limit budget
    expect(mockCheckRate).not.toHaveBeenCalled()
  })

  it('returns 429 on a cache miss when the per-IP rate limit is exceeded', async () => {
    mockGet.mockResolvedValueOnce(null)
    mockCheckRate.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterMs: 12_000 })
    const res = await GET(makeReq('http://x/api/places/school-search?q=ateneo'))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/too many requests/i)
    // The billed Places call must NOT happen when throttled
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
