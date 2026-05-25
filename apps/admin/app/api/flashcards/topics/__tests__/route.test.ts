import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
  })),
}))

describe('POST /api/flashcards/topics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockInsert.mockClear()
    mockSelectSingle.mockClear()
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/topics', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when subject_id is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Algebra' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/subject_id/i)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('inserts topic and returns { id }', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'topic-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: 'Algebra Basics' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('topic-new')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ subject_id: 'sub-1', name: 'Algebra Basics', status: 'published' })
    )
  })

  it('uses provided status when valid', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'topic-draft' }, error: null })
    const { POST } = await import('../route')
    await POST(makeReq({ subject_id: 'sub-1', name: 'Draft Topic', status: 'draft' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    )
  })

  it('returns 500 when Supabase insert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: 'Algebra' }))
    expect(res.status).toBe(500)
  })
})
