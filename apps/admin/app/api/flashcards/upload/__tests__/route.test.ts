import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockUpload = vi.fn()
const mockInsertSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))
const mockStorageBucket = vi.fn(() => ({ upload: mockUpload }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
    storage: { from: mockStorageBucket },
  })),
}))

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

function makePdfRequest(file?: File) {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return new NextRequest('http://localhost/api/flashcards/upload', {
    method: 'POST',
    body: fd,
  })
}

describe('POST /api/flashcards/upload', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUpload.mockClear()
    mockInsert.mockClear()
    mockSelectSingle.mockClear()
    mockInsertSingle.mockClear()
    mockStorageBucket.mockClear()
  })

  it('returns 400 when no file is provided', async () => {
    const POST = await importRoute()
    const res = await POST(makePdfRequest())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided')
  })

  it('returns 400 when file is not a PDF', async () => {
    const POST = await importRoute()
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Only PDF files are supported')
  })

  it('returns 400 when file exceeds 20 MB', async () => {
    const POST = await importRoute()
    const big = new File([new Uint8Array(21 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(big))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('File too large (max 20MB)')
  })

  it('returns { jobId } on success', async () => {
    mockUpload.mockResolvedValue({ error: null })
    mockInsertSingle.mockResolvedValue({ data: { id: 'job-abc' }, error: null })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(200)
    expect((await res.json()).jobId).toBe('job-abc')
  })

  it('returns 500 when Storage upload fails', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'quota exceeded' } })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(500)
  })

  it('returns 500 when DB insert fails', async () => {
    mockUpload.mockResolvedValue({ error: null })
    mockInsertSingle.mockResolvedValue({ data: null, error: { message: 'constraint' } })
    const POST = await importRoute()
    const file = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' })
    const res = await POST(makePdfRequest(file))
    expect(res.status).toBe(500)
  })
})
