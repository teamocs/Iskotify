import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockRange = vi.fn()
const mockOrder = vi.fn(() => ({ range: mockRange }))
const mockEq = vi.fn(() => ({ order: mockOrder }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: mockSelect })),
  })),
}))

const PARAMS = Promise.resolve({ id: 'subject-1' })

function makeReq(topicId: string | null, page = '1') {
  const url = new URL('http://localhost/api/flashcards/subjects/subject-1/cards')
  if (topicId) url.searchParams.set('topic_id', topicId)
  if (page !== '1') url.searchParams.set('page', page)
  return new NextRequest(url)
}

describe('GET /api/flashcards/subjects/[id]/cards', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRange.mockClear()
    mockOrder.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
  })

  it('returns 400 when topic_id is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeReq(null), { params: PARAMS })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('returns page 1 cards with hasMore true when more cards exist', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(10)
    expect(body.total).toBe(15)
    expect(body.page).toBe(1)
    expect(body.hasMore).toBe(true)
    expect(mockEq).toHaveBeenCalledWith('topic_id', 'topic-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at')
    expect(mockRange).toHaveBeenCalledWith(0, 9)
  })

  it('returns page 2 with correct offset and hasMore false', async () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1', '2'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.page).toBe(2)
    expect(body.hasMore).toBe(false)
    expect(mockRange).toHaveBeenCalledWith(10, 19)
  })

  it('returns empty result for topic with no cards', async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-empty'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(0)
    expect(body.total).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  it('returns 500 when Supabase query fails', async () => {
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB error' } })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(500)
  })
})
