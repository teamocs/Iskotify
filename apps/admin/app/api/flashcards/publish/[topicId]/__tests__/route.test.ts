import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthClient = vi.fn()
const mockServerClient = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAuthClient: async () => mockAuthClient(),
}))
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

function makeAuthClient(user: { id: string } | null = { id: 'u1' }) {
  return { auth: { getUser: async () => ({ data: { user } }) } }
}

function makeAdminDataClient() {
  return {
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

beforeEach(() => {
  mockAuthClient.mockReset()
  mockServerClient.mockReset()
  mockAuthClient.mockImplementation(() => makeAuthClient())
  mockServerClient.mockImplementation(makeAdminDataClient)
})

describe('POST /api/flashcards/publish/[topicId]', () => {
  it('returns 400 when listing_slugs is empty', async () => {
    const res = await POST(makeReq({ listing_slugs: [] }), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is missing', async () => {
    const res = await POST(makeReq({}), { params: Promise.resolve({ topicId: 'top-1' }) })
    expect(res.status).toBe(400)
  })

  it('updates topic + flashcards to published with provided slugs', async () => {
    const calls: Array<{ table: string; payload: any }> = []
    mockServerClient.mockImplementation(() => ({
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
