import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---- Rate limiter mock (allow by default; individual tests flip it) ----
const mockCheckRate = vi.fn()
vi.mock('@/lib/redis/rateLimiter', () => ({
  checkAndIncrementRate: (...args: any[]) => mockCheckRate(...args),
}))

// ---- Supabase service-role client mock ----
const mockMaybeSingle = vi.fn()
const mockInsert = vi.fn()
const mockUpdateEq = vi.fn()

const mockFrom = vi.fn(() => ({
  select: () => ({ ilike: () => ({ maybeSingle: mockMaybeSingle }) }),
  insert: mockInsert,
  update: () => ({ eq: mockUpdateEq }),
}))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))

import { POST } from '../route'

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return {
    json: async () => body,
    headers: new Headers(headers),
  } as unknown as import('next/server').NextRequest
}

const VALID_BODY = {
  fullName: 'Maria Santos',
  email: 'maria@example.com',
  school: 'Naga City Science HS',
  gradeLevel: 'Grade 12',
}

beforeEach(() => {
  mockCheckRate.mockReset()
  mockMaybeSingle.mockReset()
  mockInsert.mockReset()
  mockUpdateEq.mockReset()
  mockFrom.mockClear()
  // Default: rate limiter allows (mirrors the fail-open real implementation)
  mockCheckRate.mockResolvedValue({ allowed: true, remaining: 5 })
})

describe('POST /api/early-access', () => {
  it('returns 400 when full name is missing', async () => {
    const res = await POST(makeRequest({ email: 'maria@example.com' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid email', async () => {
    const res = await POST(makeRequest({ fullName: 'Maria', email: 'not-an-email' }))
    expect(res.status).toBe(400)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('inserts a new registration and returns ok:true', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockInsert.mockResolvedValueOnce({ error: null })

    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalledOnce()
  })

  it('updates the existing row for a repeat email and returns ok:true', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'reg-1' }, error: null })
    mockUpdateEq.mockResolvedValueOnce({ error: null })

    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    const json = await res.json() as { ok: boolean }
    expect(json.ok).toBe(true)
    expect(mockInsert).not.toHaveBeenCalled()
    expect(mockUpdateEq).toHaveBeenCalledOnce()
  })

  it('returns 429 with the standard body when the per-IP rate limit is exceeded', async () => {
    mockCheckRate.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterMs: 60_000 })

    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(429)
    const json = await res.json() as { ok: boolean; error: string }
    expect(json.ok).toBe(false)
    expect(json.error).toBe('Too many requests — try again later')
    // Throttled requests must never touch the database
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('rate-limits on the first x-forwarded-for hop', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockInsert.mockResolvedValueOnce({ error: null })

    await POST(makeRequest(VALID_BODY, { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))
    expect(mockCheckRate).toHaveBeenCalledWith(
      'early-access:203.0.113.7',
      expect.objectContaining({ max: 5, windowSec: 3600 }),
    )
  })

  it('falls back to the "unknown" bucket when x-forwarded-for is absent', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    mockInsert.mockResolvedValueOnce({ error: null })

    await POST(makeRequest(VALID_BODY))
    expect(mockCheckRate).toHaveBeenCalledWith('early-access:unknown', expect.anything())
  })
})
