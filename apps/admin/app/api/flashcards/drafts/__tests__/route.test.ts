import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthClient = vi.fn()
const mockServerClient = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAuthClient: async () => mockAuthClient(),
}))
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

import { GET } from '../route'

function makeReq(): any {
  return { url: 'http://localhost/api/flashcards/drafts', headers: new Headers() }
}

function makeAuthClient(user: { id: string } | null = { id: 'u1' }) {
  return { auth: { getUser: async () => ({ data: { user } }) } }
}

beforeEach(() => {
  mockAuthClient.mockReset()
  mockServerClient.mockReset()
  mockAuthClient.mockImplementation(() => makeAuthClient())
})

describe('GET /api/flashcards/drafts', () => {
  it('returns 403 when caller is not admin', async () => {
    mockServerClient.mockImplementation(() => ({
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'user' } }) }) }) }),
    }))
    const res = await GET(makeReq())
    expect(res.status).toBe(403)
  })

  it('returns rows for every draft topic with derived progress counters', async () => {
    mockServerClient.mockImplementation(() => ({
      from(table: string) {
        if (table === 'profiles') {
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { role: 'admin' } }) }) }) }
        }
        if (table === 'flashcard_topics') {
          return {
            select: () => ({
              eq: () => ({
                order: () => Promise.resolve({
                  data: [
                    {
                      id: 'top-1', name: 'Algebra', source_type: 'csv', created_at: '2026-05-30T00:00:00Z',
                      flashcard_subjects: { id: 'sub-1', name: 'Math' },
                      flashcards: [
                        { options: ['a','b','c','d'], ai_options: null },
                        { options: [], ai_options: ['a','b','c','d'] },
                        { options: [], ai_options: null },
                      ],
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }
        }
        return {}
      },
    }))
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.drafts).toHaveLength(1)
    const draft = body.drafts[0]
    expect(draft).toMatchObject({
      topic_id: 'top-1',
      topic_name: 'Algebra',
      subject_id: 'sub-1',
      subject_name: 'Math',
      source_type: 'csv',
      total_cards: 3,
      cards_with_options: 1,
      cards_enhanced: 1,
      cards_needing_enhancement: 1,
    })
  })
})
