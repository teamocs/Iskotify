import { describe, it, expect, vi, beforeEach } from 'vitest'

// The route uses TWO clients: createAuthClient (cookie-aware, for auth.getUser)
// and createServerClient (data, for profile/DB writes). Mock both.
const mockAuthClient = vi.fn()
const mockServerClient = vi.fn()

vi.mock('@/lib/supabase', () => ({
  createAuthClient: async () => mockAuthClient(),
}))
vi.mock('@iskotify/utils', () => ({
  createServerClient: () => mockServerClient(),
}))

// Mock importCsvCore so we don't exercise DB writes again
vi.mock('@/lib/csv/importCsvCore', () => ({
  importCsvCore: vi.fn(async () => ({ topic_ids: ['top-1'], total_cards: 2, cards_needing_enhancement: 1 })),
}))

import { POST } from '../route'

function makeAuthClient(user: { id: string } | null = { id: 'u1' }) {
  return { auth: { getUser: async () => ({ data: { user } }) } }
}

function makeDataClient(role: 'admin' | 'user' = 'admin') {
  return {
    from(table: string) {
      if (table === 'profiles') {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }
      }
      return {}
    },
  }
}

function makeReq(formData: FormData): any {
  return {
    url: 'http://localhost/api/flashcards/import-csv',
    formData: async () => formData,
    headers: new Headers({ cookie: '' }),
  }
}

beforeEach(() => {
  mockAuthClient.mockReset()
  mockServerClient.mockReset()
  mockAuthClient.mockImplementation(() => makeAuthClient())
  mockServerClient.mockImplementation(() => makeDataClient('admin'))
})

describe('POST /api/flashcards/import-csv', () => {
  it('returns 401 when user is unauthenticated', async () => {
    mockAuthClient.mockImplementation(() => makeAuthClient(null))
    const fd = new FormData()
    fd.append('file', new File(['x'], 'a.csv', { type: 'text/csv' }))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is authenticated but not admin', async () => {
    mockServerClient.mockImplementation(() => makeDataClient('user'))
    const fd = new FormData()
    fd.append('file', new File(['x'], 'a.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(403)
  })

  it('returns 400 when no file is sent', async () => {
    const res = await POST(makeReq(new FormData()))
    expect(res.status).toBe(400)
  })

  it('returns 400 when file fails size check', async () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.csv')
    const fd = new FormData()
    fd.append('file', big)
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(400)
  })

  it('returns 400 with rowErrors when CSV has invalid rows', async () => {
    const csv = `subject,topic,question,answer,explanation,distractors
,Algebra,Q1,A1,,
Math,Algebra,Q2,,,
`
    const fd = new FormData()
    fd.append('file', new File([csv], 'cards.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.rowErrors).toBeDefined()
    expect(body.rowErrors.length).toBeGreaterThan(0)
  })

  it('returns 200 with topic_ids on valid CSV', async () => {
    const csv = `subject,topic,question,answer,explanation,distractors
Math,Algebra,What is 2+2?,4,,3|5|6
Math,Algebra,What is 3+3?,6,,4|5|7
`
    const fd = new FormData()
    fd.append('file', new File([csv], 'cards.csv'))
    const res = await POST(makeReq(fd))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.topic_ids).toEqual(['top-1'])
    expect(body.total_cards).toBe(2)
    expect(body.cards_needing_enhancement).toBe(1)
  })
})
