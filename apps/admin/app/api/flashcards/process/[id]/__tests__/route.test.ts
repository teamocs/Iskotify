import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('GEMINI_API_KEY', 'fake-gemini-key')

const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({ generateContent: mockGenerateContent }),
  })),
}))

const mockSingle = vi.fn()
const mockSelectChain = vi.fn(() => ({ single: mockSingle }))
const mockEqChain = vi.fn(() => ({ select: mockSelectChain }))
const mockUpdate = vi.fn(() => ({ eq: mockEqChain }))
const mockUpsert = vi.fn(() => ({ select: mockSelectChain }))
const mockInsertSelect = vi.fn(() => ({ select: mockSelectChain }))
const mockInsertFlat = vi.fn().mockResolvedValue({ error: null })
const mockDownload = vi.fn()
const mockStorageBucket = vi.fn(() => ({ download: mockDownload }))

const mockFrom = vi.fn((table: string) => {
  if (table === 'flashcard_subjects') return { upsert: mockUpsert }
  if (table === 'flashcard_topics')   return { insert: mockInsertSelect }
  if (table === 'flashcards')         return { insert: mockInsertFlat }
  return { update: mockUpdate }
})

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: mockFrom,
    storage: { from: mockStorageBucket },
  })),
}))

const VALID_GEMINI_JSON = JSON.stringify({
  subject: 'Science',
  topic: 'Cell Biology',
  cards: [
    { question: 'Q1', answer: 'A1', explanation: '', difficulty: 1 },
  ],
})

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makeReq(id = 'job-1') {
  return new NextRequest(`http://localhost/api/flashcards/process/${id}`, { method: 'POST' })
}

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

describe('POST /api/flashcards/process/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockSelectChain.mockClear()
    mockEqChain.mockClear()
    mockUpdate.mockClear()
    mockUpsert.mockClear()
    mockInsertSelect.mockClear()
    mockInsertFlat.mockClear()
    mockDownload.mockClear()
    mockStorageBucket.mockClear()
    mockFrom.mockClear()
    mockGenerateContent.mockClear()
  })

  it('returns 404 when job does not exist', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('missing'))
    expect(res.status).toBe(404)
  })

  it('returns 200 and writes draft cards on success', async () => {
    mockSingle
      .mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'subj-1' }, error: null })
      .mockResolvedValueOnce({ data: { id: 'topic-1' }, error: null })

    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })

    mockGenerateContent.mockResolvedValue({
      response: { text: () => VALID_GEMINI_JSON },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(200)
    expect(mockInsertFlat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ question: 'Q1', status: 'draft', topic_id: 'topic-1' }),
      ])
    )
    // Verify source_pdf_url is set on inserted cards
    expect(mockInsertFlat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ source_pdf_url: 'abc.pdf' }),
      ])
    )
    // Verify job is updated to done with correct ids
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', subject_id: 'subj-1', topic_id: 'topic-1', card_count: 1 })
    )
  })

  it('marks job failed when Gemini returns malformed JSON', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'not json at all' },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_msg: 'Gemini returned unexpected format' })
    )
  })

  it('marks job failed when Gemini returns empty cards array', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ subject: 'X', topic: 'Y', cards: [] }) },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' })
    )
  })

  it('marks job failed when PDF download fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }))
  })

  it('marks job failed when Gemini returns JSON without subject or topic', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'job-1', pdf_url: 'abc.pdf' }, error: null })
    mockDownload.mockResolvedValue({
      data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      error: null,
    })
    mockGenerateContent.mockResolvedValue({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '', difficulty: 1 }] }) },
    })

    const POST = await importRoute()
    const res = await POST(makeReq(), makeParams('job-1'))
    expect(res.status).toBe(500)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', error_msg: 'Gemini returned unexpected format' })
    )
  })
})
