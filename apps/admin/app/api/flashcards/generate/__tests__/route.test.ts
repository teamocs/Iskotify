import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({ generateContent: mockGenerateContent }),
  })),
}))

const mockGenerateDistractors = vi.fn().mockResolvedValue(null)
vi.mock('@/lib/gemini/generateDistractors', () => ({
  generateDistractorsForCard: mockGenerateDistractors,
}))

// ── Auth client mock ──────────────────────────────────────────────────────────
const mockGetUser = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

// ── Supabase mock (for profile lookup only) ───────────────────────────────────
const mockProfileSingle = vi.fn()
vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: mockProfileSingle }),
          }),
        }
      }
      return {}
    }),
  })),
}))

// ── Auth helpers ──────────────────────────────────────────────────────────────
function adminUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'admin-1' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'admin' }, error: null })
}

function noUser() {
  mockGetUser.mockResolvedValueOnce({ data: { user: null } })
}

function nonAdmin() {
  mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'u2' } } })
  mockProfileSingle.mockResolvedValueOnce({ data: { role: 'viewer' }, error: null })
}

function makeReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/flashcards/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function importRoute() {
  const mod = await import('../route')
  return mod
}

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('GEMINI_API_KEY', 'fake-gemini-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'fake-anon-key')
  mockGetUser.mockReset()
  mockProfileSingle.mockReset()
  mockGenerateContent.mockReset()
  mockGenerateDistractors.mockReset()
  mockGenerateDistractors.mockResolvedValue(null)  // default: distractor gen returns null (no enrichment)
})

describe('POST /api/flashcards/generate', () => {
  it('returns 401 when unauthenticated', async () => {
    noUser()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(401)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('returns 403 when signed-in non-admin', async () => {
    nonAdmin()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(403)
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('returns 503 when GEMINI_API_KEY is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    adminUser()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/GEMINI_API_KEY/)
  })

  it('returns 400 when subject_name is missing', async () => {
    adminUser()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ topic_name: 'Algebra' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when topic_name is missing', async () => {
    adminUser()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when subject_name is empty/whitespace', async () => {
    adminUser()
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: '   ', topic_name: 'Algebra' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with cards on a valid Gemini response', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          cards: [
            { question: 'Q1', answer: 'A1', explanation: 'E1' },
            { question: 'Q2', answer: 'A2', explanation: '' },
          ],
        }),
      },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra', count: 2 }))
    expect(res.status).toBe(200)
    const body = await res.json() as { cards: Array<{ question: string; answer: string; explanation: string }> }
    expect(body.cards).toHaveLength(2)
    expect(body.cards[0]).toEqual({ question: 'Q1', answer: 'A1', explanation: 'E1' })
    expect(body.cards[1]!.explanation).toBe('')
  })

  it('threads optionExplanations/strategyTip from generateDistractorsForCard into the returned cards (Task E)', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          cards: [{ question: 'Q1', answer: 'A1', explanation: 'E1' }],
        }),
      },
    })
    mockGenerateDistractors.mockResolvedValueOnce({
      options: ['A1', 'B', 'C', 'D'],
      correctIndex: 0,
      explanation: 'AI explanation',
      optionExplanations: [null, 'B is wrong', 'C is wrong', 'D is wrong'],
      strategyTip: 'Check units before comparing.',
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra', count: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json() as {
      cards: Array<{ optionExplanations?: (string | null)[]; strategyTip?: string; aiOptions?: string[] }>
    }
    expect(body.cards[0]!.aiOptions).toEqual(['A1', 'B', 'C', 'D'])
    expect(body.cards[0]!.optionExplanations).toEqual([null, 'B is wrong', 'C is wrong', 'D is wrong'])
    expect(body.cards[0]!.strategyTip).toBe('Check units before comparing.')
  })

  it('strips markdown fences and trailing prose from Gemini output', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n' + JSON.stringify({
          cards: [{ question: 'Q', answer: 'A', explanation: '' }],
        }) + '\n```\nHope this helps!',
      },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { cards: unknown[] }
    expect(body.cards).toHaveLength(1)
  })

  it('returns 502 when Gemini returns unparseable text', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'sorry I cannot do that' },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(502)
  })

  it('returns 502 when Gemini returns empty cards array', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [] }) },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(502)
  })

  it('drops cards with missing question or answer', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          cards: [
            { question: 'Good Q', answer: 'Good A', explanation: '' },
            { question: '', answer: 'missing q', explanation: '' },
            { question: 'missing a', answer: '   ', explanation: '' },
          ],
        }),
      },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(200)
    const body = await res.json() as { cards: Array<{ question: string }> }
    expect(body.cards).toHaveLength(1)
    expect(body.cards[0]!.question).toBe('Good Q')
  })

  it('clamps count to [1, 25] before passing to the prompt', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra', count: 9999 }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('exactly 25 flashcards')
    expect(promptArg).not.toContain('exactly 9999')
  })

  it('uses the default count (10) when count is missing', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('exactly 10 flashcards')
  })

  it('injects listing slugs into the prompt for style targeting when provided', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({
      subject_name: 'Math',
      topic_name: 'Algebra',
      listing_slugs: ['upcat', 'acet', 'dost-sei'],
    }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('upcat')
    expect(promptArg).toContain('acet')
    expect(promptArg).toContain('dost-sei')
  })

  it('falls back to a generic exam-style line when no listing slugs are provided', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toMatch(/general Philippine college-entrance/i)
  })

  it('returns 500 when Gemini throws unexpectedly', async () => {
    adminUser()
    mockGenerateContent.mockRejectedValueOnce(new Error('network down'))
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(500)
  })

  it('drops generated cards whose stems duplicate existing_questions (case-insensitive)', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          cards: [
            { question: 'WHAT IS 2+2?', answer: '4', explanation: '' },
            { question: 'What is 3+3?', answer: '6', explanation: '' },
          ],
        }),
      },
    })
    const { POST } = await importRoute()
    const res = await POST(new NextRequest('http://localhost/api/flashcards/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_name: 'Math', topic_name: 'Algebra',
        existing_questions: ['What is 2+2?'],
      }),
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { cards: Array<{ question: string }> }
    expect(body.cards).toHaveLength(1)
    expect(body.cards[0]!.question).toBe('What is 3+3?')
  })
})

describe('buildGenerationPrompt', () => {
  it('mentions key Philippine exams in the prompt body', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 10, listingSlugs: [] })
    // A spot-check of high-importance exams that anchor the model's style.
    expect(out).toContain('UPCAT')
    expect(out).toContain('ACET')
    expect(out).toContain('DOST-SEI')
    expect(out).toContain('CHED')
  })

  it('enforces single-best-answer + no-rote-memorization quality rules', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 10, listingSlugs: [] })
    expect(out).toMatch(/Single best.*unambiguous answer/i)
    expect(out).toMatch(/NOT rote memorization/i)
  })

  it('requests JSON output without markdown fences', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 10, listingSlugs: [] })
    expect(out).toMatch(/valid JSON/i)
    expect(out).toMatch(/No markdown fences/i)
  })

  it('embeds subject, topic, and count in the prompt', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({ subject: 'Filipino', topic: 'Panitikan', count: 7, listingSlugs: [] })
    expect(out).toContain('Filipino')
    expect(out).toContain('Panitikan')
    expect(out).toContain('exactly 7 flashcards')
  })

  it('includes DO-NOT-DUPLICATE directive when existingQuestions provided', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({
      subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [],
      existingQuestions: ['What is 2+2?', 'Define a function'],
    })
    expect(out).toMatch(/DO NOT duplicate or paraphrase/i)
    expect(out).toContain('What is 2+2?')
    expect(out).toContain('Define a function')
  })

  it('omits the duplicate directive when existingQuestions empty', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({
      subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [], existingQuestions: [],
    })
    expect(out).not.toMatch(/DO NOT duplicate or paraphrase/i)
  })

  it('includes a FORMAT INSTRUCTIONS section with the admin text when formatNotes is provided', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({
      subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [],
      formatNotes: '4-option multiple choice, one paragraph reading passage per question',
    })
    expect(out).toContain('FORMAT INSTRUCTIONS FROM ADMIN')
    expect(out).toContain('4-option multiple choice, one paragraph reading passage per question')
  })

  it('omits the FORMAT INSTRUCTIONS section when formatNotes is absent or blank', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out1 = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [] })
    expect(out1).not.toContain('FORMAT INSTRUCTIONS FROM ADMIN')
    const out2 = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [], formatNotes: '   ' })
    expect(out2).not.toContain('FORMAT INSTRUCTIONS FROM ADMIN')
  })

  it('includes a SAMPLE QUESTIONS section with the sample text when sampleText is provided', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({
      subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [],
      sampleText: 'Q: What is the capital of Laguna? A: Santa Cruz',
    })
    expect(out).toContain('SAMPLE QUESTIONS TO IMITATE')
    expect(out).toContain('Q: What is the capital of Laguna? A: Santa Cruz')
  })

  it('omits the SAMPLE QUESTIONS section when sampleText is absent or blank', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out1 = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [] })
    expect(out1).not.toContain('SAMPLE QUESTIONS TO IMITATE')
    const out2 = buildGenerationPrompt({ subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [], sampleText: '   ' })
    expect(out2).not.toContain('SAMPLE QUESTIONS TO IMITATE')
  })

  it('includes both format and sample sections together when both are provided', async () => {
    const { buildGenerationPrompt } = await importRoute()
    const out = buildGenerationPrompt({
      subject: 'Math', topic: 'Algebra', count: 5, listingSlugs: [],
      formatNotes: 'True/False only',
      sampleText: 'True or False: 2+2=4',
    })
    expect(out).toContain('FORMAT INSTRUCTIONS FROM ADMIN')
    expect(out).toContain('True/False only')
    expect(out).toContain('SAMPLE QUESTIONS TO IMITATE')
    expect(out).toContain('True or False: 2+2=4')
  })
})

describe('POST /api/flashcards/generate — formatNotes/sampleText passthrough', () => {
  it('forwards formatNotes and sampleText from the request body into the prompt', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({
      subject_name: 'Math',
      topic_name: 'Algebra',
      formatNotes: 'Short-answer only, no MCQ',
      sampleText: 'Sample: Solve for x in 2x=4',
    }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('FORMAT INSTRUCTIONS FROM ADMIN')
    expect(promptArg).toContain('Short-answer only, no MCQ')
    expect(promptArg).toContain('SAMPLE QUESTIONS TO IMITATE')
    expect(promptArg).toContain('Sample: Solve for x in 2x=4')
  })

  it('caps sampleText and formatNotes at 20k chars before building the prompt', async () => {
    adminUser()
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    const longText = 'x'.repeat(25000)
    await POST(makeReq({
      subject_name: 'Math',
      topic_name: 'Algebra',
      sampleText: longText,
    }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    // Prompt should not contain the full 25k-char run — it was capped to 20k.
    expect(promptArg).not.toContain(longText)
    expect(promptArg).toContain('x'.repeat(20000))
  })
})
