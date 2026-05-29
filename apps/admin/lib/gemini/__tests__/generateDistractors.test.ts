import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGenerateContent = vi.fn()

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
    getGenerativeModel: vi.fn().mockReturnValue({ generateContent: mockGenerateContent }),
  })),
}))

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('GEMINI_API_KEY', 'fake-gemini-key')
  mockGenerateContent.mockReset()
})

async function importLib() {
  return (await import('../generateDistractors'))
}

describe('generateDistractorsForCard', () => {
  it('returns null when GEMINI_API_KEY is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'Math', topic: 'Algebra', question: 'Q', answer: 'A' })
    expect(out).toBeNull()
  })

  it('returns a shuffled DistractorResult on valid Gemini JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          wrong_1: 'Wrong A', wrong_2: 'Wrong B', wrong_3: 'Wrong C',
          explanation: 'Because reasons',
        }),
      },
    })
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'Math', topic: 'Algebra', question: 'Q', answer: 'Correct' })
    expect(out).not.toBeNull()
    expect(out!.options).toHaveLength(4)
    expect(out!.options).toContain('Correct')
    expect(out!.options).toContain('Wrong A')
    expect(out!.correctIndex).toBeGreaterThanOrEqual(0)
    expect(out!.correctIndex).toBeLessThanOrEqual(3)
    expect(out!.options[out!.correctIndex]).toBe('Correct')
    expect(out!.explanation).toBe('Because reasons')
  })

  it('strips markdown fences from Gemini output', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '```json\n' + JSON.stringify({
          wrong_1: 'a', wrong_2: 'b', wrong_3: 'c', explanation: 'e',
        }) + '\n```',
      },
    })
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'Answer' })
    expect(out).not.toBeNull()
    expect(out!.options).toContain('Answer')
  })

  it('returns null when any distractor duplicates the correct answer (case-insensitive)', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          wrong_1: 'PARIS', wrong_2: 'London', wrong_3: 'Berlin', explanation: 'x',
        }),
      },
    })
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'Geo', topic: 'Capitals', question: 'Capital of France?', answer: 'Paris' })
    expect(out).toBeNull()
  })

  it('returns null when two distractors are identical', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          wrong_1: 'Same', wrong_2: 'same', wrong_3: 'Different', explanation: 'x',
        }),
      },
    })
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'A' })
    expect(out).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => 'sorry I cannot do that' },
    })
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'A' })
    expect(out).toBeNull()
  })

  it('returns null when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('network down'))
    const { generateDistractorsForCard } = await importLib()
    const out = await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'A' })
    expect(out).toBeNull()
  })

  it('prompt sent to Gemini includes the correct answer with a DO NOT include directive', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: { text: () => JSON.stringify({ wrong_1: 'a', wrong_2: 'b', wrong_3: 'c', explanation: 'e' }) },
    })
    const { generateDistractorsForCard } = await importLib()
    await generateDistractorsForCard({ subject: 'Sci', topic: 'Bio', question: 'What is X?', answer: 'Mitochondria' })
    const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
    expect(promptArg).toContain('Mitochondria')
    expect(promptArg).toMatch(/DO NOT include/i)
  })
})
