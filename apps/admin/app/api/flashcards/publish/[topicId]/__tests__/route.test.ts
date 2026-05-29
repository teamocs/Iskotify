import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockServerClient = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

import { POST } from '../route'

function makeReq(body: any): any {
  return {
    url: 'http://localhost/api/flashcards/publish/top-1',
    json: async () => body,
    headers: new Headers(),
  }
}

function makeAdmin() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
      }
      const chain = {
        update: vi.fn(() => chain),
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      }
      ;(chain as any)._table = table
      return chain as any
    },
  }
}

beforeEach(() => { mockServerClient.mockReset() })

describe('POST /api/flashcards/publish/[topicId]', () => {
  it('returns 400 when listing_slugs is empty', async () => {
    mockServerClient.mockImplementation(makeAdmin)
    const res = await POST(makeReq({ listing_slugs: [] }), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is missing', async () => {
    mockServerClient.mockImplementation(makeAdmin)
    const res = await POST(makeReq({}), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('updates topic + flashcards to published with provided slugs', async () => {
    const calls: Array<{ table: string; payload: any }> = []
    mockServerClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from(table: string) {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
        }
        return {
          update(payload: any) {
            calls.push({ table, payload })
            return { eq: () => Promise.resolve({ data: null, error: null }) }
          },
        }
      },
    }))
    const res = await POST(
      makeReq({ listing_slugs: ['upcat', 'dost-sei'] }),
      { params: Promise.resolve({ topicId: 'top-1' }) },
    )
    expect(res.status).toBe(200)
    expect(calls.find(c => c.table === 'flashcard_topics')?.payload.status).toBe('published')
    expect(calls.find(c => c.table === 'flashcards')?.payload.status).toBe('published')
    expect(calls.find(c => c.table === 'flashcards')?.payload.listing_slugs).toEqual(['upcat', 'dost-sei'])
  })
})
