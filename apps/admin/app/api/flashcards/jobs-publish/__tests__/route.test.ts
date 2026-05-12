import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockEqFlat = vi.fn().mockResolvedValue({ error: null })
const mockUpdateEqFlat = vi.fn(() => ({ eq: mockEqFlat }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'pdf_jobs')            return { select: mockSelect, update: mockUpdateEqFlat }
      if (table === 'flashcard_subjects')  return { update: mockUpdateEqFlat }
      if (table === 'flashcard_topics')    return { update: mockUpdateEqFlat }
      if (table === 'flashcards')          return { select: mockSelect, update: mockUpdateEqFlat }
      return { select: mockSelect, update: mockUpdateEqFlat }
    }),
  })),
}))

// ─── GET /api/flashcards/jobs/[id] ───────────────────────────────────────────

describe('GET /api/flashcards/jobs/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
  })

  it('returns job fields when found', async () => {
    mockSingle.mockResolvedValueOnce({
      data: { status: 'done', card_count: 28, error_msg: null, subject_id: 'subj-1', topic_id: 'topic-1' },
      error: null,
    })
    const { GET } = await import('../../jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/jobs/job-1')
    const res = await GET(req, { params: Promise.resolve({ id: 'job-1' }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('done')
    expect(body.card_count).toBe(28)
  })

  it('returns 404 when job not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const { GET } = await import('../../jobs/[id]/route')
    const req = new NextRequest('http://localhost/api/flashcards/jobs/bad')
    const res = await GET(req, { params: Promise.resolve({ id: 'bad' }) })
    expect(res.status).toBe(404)
  })
})

// ─── POST /api/flashcards/publish/[jobId] ────────────────────────────────────

describe('POST /api/flashcards/publish/[jobId]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
    mockEqFlat.mockClear()
    mockUpdateEqFlat.mockClear()
  })

  function makePublishReq(jobId: string, body: object) {
    return new NextRequest(`http://localhost/api/flashcards/publish/${jobId}`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when listing_slugs is empty', async () => {
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', { listing_slugs: [], subject_name: 'Science', topic_name: 'Cell Bio' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/exam tag/i)
  })

  it('returns 404 when job not found', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('bad', { listing_slugs: ['x'], subject_name: 'S', topic_name: 'T' }),
      { params: Promise.resolve({ jobId: 'bad' }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 when there are no cards to publish', async () => {
    // job lookup
    mockSingle
      .mockResolvedValueOnce({ data: { topic_id: 'topic-1', subject_id: 'subj-1' }, error: null })
      // flashcards select → empty array
      .mockResolvedValueOnce({ data: [], error: null })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', { listing_slugs: ['dost-2026'], subject_name: 'Science', topic_name: 'Cell Bio' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no cards/i)
  })

  it('publishes topic and cards and returns { ok, published }', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { topic_id: 'topic-1', subject_id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'card-1' }, { id: 'card-2' }], error: null })
    const { POST } = await import('../../publish/[jobId]/route')
    const res = await POST(
      makePublishReq('job-1', { listing_slugs: ['dost-2026'], subject_name: 'Science', topic_name: 'Cell Biology' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.published).toBe(2)
  })

  it('updates flashcards with correct listing_slugs', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { topic_id: 'topic-1', subject_id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: [{ id: 'card-1' }], error: null })
    const { POST } = await import('../../publish/[jobId]/route')
    await POST(
      makePublishReq('job-1', { listing_slugs: ['dost-2026', 'upcat-2026'], subject_name: 'S', topic_name: 'T' }),
      { params: Promise.resolve({ jobId: 'job-1' }) }
    )
    expect(mockUpdateEqFlat).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', listing_slugs: ['dost-2026', 'upcat-2026'] })
    )
  })
})
