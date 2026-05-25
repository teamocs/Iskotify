import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockPatchSingle = vi.fn()
const mockDeleteSingle = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: (_table: string) => ({
      update: (_data: object) => ({
        eq: (_col: string, _val: string) => ({
          select: (_cols: string) => ({ single: mockPatchSingle }),
        }),
      }),
      delete: () => ({
        eq: (_col: string, _val: string) => ({
          select: (_cols: string) => ({ single: mockDeleteSingle }),
        }),
      }),
    }),
  })),
}))

function patchReq(id: string, body: object) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'DELETE',
  })
}

describe('PATCH /api/flashcards/subjects/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockPatchSingle.mockClear()
  })

  it('returns 400 when name is missing', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: '   ', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is not an array', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: 'not-array' }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when subject does not exist', async () => {
    mockPatchSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('nonexistent', { name: 'Math', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated subject on success', async () => {
    mockPatchSingle.mockResolvedValue({
      data: { id: 'sub-1', name: 'Mathematics', listing_slugs: ['dost-sei'] },
      error: null,
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      patchReq('sub-1', { name: 'Mathematics', listing_slugs: ['dost-sei'] }),
      { params: Promise.resolve({ id: 'sub-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Mathematics')
    expect(body.listing_slugs).toEqual(['dost-sei'])
  })
})

describe('DELETE /api/flashcards/subjects/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDeleteSingle.mockClear()
  })

  it('returns 404 when subject does not exist', async () => {
    mockDeleteSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('nonexistent'), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    mockDeleteSingle.mockResolvedValue({ data: { id: 'sub-1' }, error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('sub-1'), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(204)
  })
})
