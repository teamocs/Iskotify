import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockAuthClient = vi.fn()
const mockServerClient = vi.fn()
vi.mock('@/lib/supabase', () => ({ createAuthClient: async () => mockAuthClient() }))
vi.mock('@iskotify/utils', () => ({ createServerClient: () => mockServerClient() }))
vi.mock('@/lib/upcat/importUpcatCore', () => ({
  importUpcatCore: vi.fn(async () => ({ passages: 23, questions: 320 })),
}))

import { POST } from '../route'

function makeAuthClient(user: { id: string } | null = { id: 'u1' }) {
  return { auth: { getUser: async () => ({ data: { user } }) } }
}
function makeDataClient(role = 'admin') {
  return { from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role } }) }) }) }) }
}
function makeReq(csv: string): any {
  const fd = new FormData()
  fd.append('file', new File([csv], 'q.csv'))
  return { url: 'http://x/api/upcat-questions/import', formData: async () => fd, headers: new Headers() }
}
const HEADER = 'question_id,subtest,main_subject,topic,subtopic,question_format,cognitive_level,difficulty,curriculum_alignment,has_visual,visual_type,visual_description,set_id,set_position,passage_text,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,status'
const SAMPLE = HEADER + '\nM001,Mathematics,,,,,,,,No,None,,,,,Q?,a,b,c,d,C,because,Approved'

beforeEach(() => {
  mockAuthClient.mockReset(); mockServerClient.mockReset()
  mockAuthClient.mockImplementation(() => makeAuthClient())
  mockServerClient.mockImplementation(() => makeDataClient('admin'))
})

describe('POST /api/upcat-questions/import', () => {
  it('401 when unauthenticated', async () => {
    mockAuthClient.mockImplementation(() => makeAuthClient(null))
    const res = await POST(makeReq(SAMPLE))
    expect(res.status).toBe(401)
  })
  it('403 when not admin', async () => {
    mockServerClient.mockImplementation(() => makeDataClient('user'))
    const res = await POST(makeReq(SAMPLE))
    expect(res.status).toBe(403)
  })
  it('400 when no file', async () => {
    const res = await POST({ url: 'http://x', formData: async () => new FormData(), headers: new Headers() } as any)
    expect(res.status).toBe(400)
  })
  it('400 when required columns missing', async () => {
    const res = await POST(makeReq('question_id,subtest\nM001,Mathematics'))
    expect(res.status).toBe(400)
  })
  it('200 with counts on valid CSV', async () => {
    const res = await POST(makeReq(SAMPLE))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ passages: 23, questions: 320 })
  })
})
