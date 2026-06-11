import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockSelect = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({
      insert: mockInsert,
      update: mockUpdate,
      delete: () => ({ eq: mockEq }),
      select: mockSelect
    })
  })
}))

// Mock next/cache so unstable_cache and revalidateTag work outside Next.js request context
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: any[]) => any) => fn,
  revalidateTag: vi.fn(),
}))

// Mock next/headers for auth check
vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [] })
}))

describe('POST /api/admin/listings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a listing and returns 201', async () => {
    mockInsert.mockResolvedValue({ error: null })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Test Scholarship',
        slug: 'test-scholarship',
        provider: 'Test Org',
        status: 'active',
        region: 'Nationwide'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(mockInsert).toHaveBeenCalledOnce()
  })

  it('passes results_date and scholarship_meta to insert', async () => {
    mockInsert.mockResolvedValue({ error: null })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Meta Scholarship',
        slug: 'meta-scholarship',
        provider: 'Meta Org',
        status: 'active',
        region: 'Nationwide',
        results_date: '2026-12-01',
        scholarship_meta: { huc_excluded: true, target_year_levels: ['Grade 12'], other_benefits: ['Free uniform'] }
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(201)
    const insertArg = mockInsert.mock.calls[0]![0]
    expect(insertArg.results_date).toBe('2026-12-01')
    expect(insertArg.scholarship_meta).toEqual({ huc_excluded: true, target_year_levels: ['Grade 12'], other_benefits: ['Free uniform'] })
  })

  it('returns 400 when required fields are missing', async () => {
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({ title: 'Missing type and slug' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 500 when Supabase insert fails', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const req = new NextRequest('http://localhost/api/admin/listings', {
      method: 'POST',
      body: JSON.stringify({
        type: 'scholarship',
        title: 'Test',
        slug: 'test',
        provider: 'Org',
        status: 'active',
        region: 'NCR'
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/admin/listings/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates a listing and returns 200', async () => {
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockResolvedValue({ error: null })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Updated Title' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('id', 'abc')
  })

  it('passes results_date and scholarship_meta through PATCH', async () => {
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockResolvedValue({ error: null })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({
        results_date: '2026-12-15',
        scholarship_meta: { huc_excluded: false, target_year_levels: ['Grade 12'], other_benefits: [] }
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    // The [id] route spreads the full body into update — verify it was called
    expect(mockUpdate).toHaveBeenCalledOnce()
    const updateArg = mockUpdate.mock.calls[0]![0]
    expect(updateArg.results_date).toBe('2026-12-15')
    expect(updateArg.scholarship_meta).toEqual({ huc_excluded: false, target_year_levels: ['Grade 12'], other_benefits: [] })
  })

  it('returns 500 when update fails', async () => {
    mockUpdate.mockReturnValue({ eq: mockEq })
    mockEq.mockResolvedValue({ error: { message: 'DB error' } })
    const { PATCH } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'Content-Type': 'application/json' }
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/listings/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes a listing and returns 200', async () => {
    mockEq.mockResolvedValue({ error: null })
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('id', 'abc')
  })

  it('returns 500 when delete fails', async () => {
    mockEq.mockResolvedValue({ error: { message: 'DB error' } })
    const { DELETE } = await import('../[id]/route')
    const req = new NextRequest('http://localhost/api/admin/listings/abc', { method: 'DELETE' })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(500)
  })
})
