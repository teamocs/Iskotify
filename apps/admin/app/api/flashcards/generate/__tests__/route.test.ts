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
  mockGenerateContent.mockReset()
  mockGenerateDistractors.mockReset()
  mockGenerateDistractors.mockResolvedValue(null)  // default: distractor gen returns null (no enrichment)
})

describe('POST /api/flashcards/generate', () => {
  it('returns 503 when GEMINI_API_KEY is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(503)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/GEMINI_API_KEY/)
  })

  it('returns 400 when subject_name is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ topic_name: 'Algebra' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when topic_name is missing', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when subject_name is empty/whitespace', async () => {
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: '   ', topic_name: 'Algebra' }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with cards on a valid Gemini response', async () => {
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

  it('strips markdown fences and trailing prose from Gemini output', async () => {
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
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'sorry I cannot do that' },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(502)
  })

  it('returns 502 when Gemini returns empty cards array', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [] }) },
    })
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(502)
  })

  it('drops cards with missing question or answer', async () => {
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
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('exactly 10 flashcards')
  })

  it('injects listing slugs into the prompt for style targeting when provided', async () => {
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
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ cards: [{ question: 'Q', answer: 'A', explanation: '' }] }) },
    })
    const { POST } = await importRoute()
    await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toMatch(/general Philippine college-entrance/i)
  })

  it('returns 500 when Gemini throws unexpectedly', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('network down'))
    const { POST } = await importRoute()
    const res = await POST(makeReq({ subject_name: 'Math', topic_name: 'Algebra' }))
    expect(res.status).toBe(500)
  })

  it('drops generated cards whose stems duplicate existing_questions (case-insensitive)', async () => {
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
})
