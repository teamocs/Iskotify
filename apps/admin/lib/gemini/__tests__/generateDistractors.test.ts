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

  // Task E — option_explanations + strategy_tip threaded through the same call.
  describe('optionExplanations / strategyTip (Task E)', () => {
    it('returns optionExplanations (null at correctIndex) and strategyTip re-permuted alongside options', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({
            wrong_1: 'Wrong A', wrong_1_why: 'Confuses concept A.',
            wrong_2: 'Wrong B', wrong_2_why: 'Off-by-one mistake.',
            wrong_3: 'Wrong C', wrong_3_why: 'Applies the wrong formula.',
            explanation: 'Because reasons',
            strategy_tip: 'Check units before comparing.',
          }),
        },
      })
      const { generateDistractorsForCard } = await importLib()
      const out = await generateDistractorsForCard({ subject: 'Math', topic: 'Algebra', question: 'Q', answer: 'Correct' })
      expect(out).not.toBeNull()
      expect(out!.strategyTip).toBe('Check units before comparing.')
      expect(out!.optionExplanations).toHaveLength(4)
      expect(out!.optionExplanations[out!.correctIndex]).toBeNull()

      const byOption = new Map(out!.options.map((o, i) => [o, out!.optionExplanations[i]]))
      expect(byOption.get('Wrong A')).toBe('Confuses concept A.')
      expect(byOption.get('Wrong B')).toBe('Off-by-one mistake.')
      expect(byOption.get('Wrong C')).toBe('Applies the wrong formula.')
      expect(byOption.get('Correct')).toBeNull()
    })

    it('defaults strategyTip to "" and optionExplanations entries to null when Gemini omits the new fields (backward-compatible prompt shape)', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: {
          text: () => JSON.stringify({ wrong_1: 'a', wrong_2: 'b', wrong_3: 'c', explanation: 'e' }),
        },
      })
      const { generateDistractorsForCard } = await importLib()
      const out = await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'Correct' })
      expect(out).not.toBeNull()
      expect(out!.strategyTip).toBe('')
      expect(out!.optionExplanations.filter(e => e !== null)).toHaveLength(0)
    })

    it('prompt asks for wrong_N_why and strategy_tip', async () => {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ wrong_1: 'a', wrong_2: 'b', wrong_3: 'c', explanation: 'e' }) },
      })
      const { generateDistractorsForCard } = await importLib()
      await generateDistractorsForCard({ subject: 'S', topic: 'T', question: 'Q', answer: 'A' })
      const promptArg = mockGenerateContent.mock.calls[0]?.[0] as string
      expect(promptArg).toContain('wrong_1_why')
      expect(promptArg).toContain('strategy_tip')
    })
  })

  // Task F — distractor difficulty overhaul. These assert the prompt's
  // STRUCTURE (rubric / few-shots / forbidden patterns), not its wording, so
  // they stay meaningful even if the prose is later tweaked.
  describe('distractor difficulty rubric (Task F)', () => {
    async function capturedPrompt(): Promise<string> {
      mockGenerateContent.mockResolvedValueOnce({
        response: { text: () => JSON.stringify({ wrong_1: 'a', wrong_2: 'b', wrong_3: 'c', explanation: 'e' }) },
      })
      const { generateDistractorsForCard } = await importLib()
      await generateDistractorsForCard({ subject: 'Math', topic: 'Algebra', question: 'Q', answer: 'Correct' })
      return mockGenerateContent.mock.calls[0]?.[0] as string
    }

    it('includes an explicit tiered difficulty rubric', async () => {
      const prompt = await capturedPrompt()
      expect(prompt).toMatch(/DIFFICULTY RUBRIC/i)
      expect(prompt).toMatch(/TIER 1/)
      expect(prompt).toMatch(/TIER 2/)
      expect(prompt).toMatch(/TIER 3/)
    })

    it('includes a WEAK-vs-STRONG few-shot contrast for the same question', async () => {
      const prompt = await capturedPrompt()
      expect(prompt).toMatch(/FEW-SHOT/i)
      expect(prompt).toMatch(/WEAK/)
      expect(prompt).toMatch(/STRONG/)
    })

    it('forbids "all/none of the above" and joke options', async () => {
      const prompt = await capturedPrompt()
      expect(prompt).toMatch(/FORBIDDEN/i)
      expect(prompt).toMatch(/all of the above/i)
      expect(prompt).toMatch(/none of the above/i)
      expect(prompt).toMatch(/joke options/i)
    })

    it('requires distractors to match the correct answer\'s length/format', async () => {
      const prompt = await capturedPrompt()
      expect(prompt).toMatch(/length/i)
      expect(prompt).toMatch(/format/i)
    })

    it('requires each distractor to be tied to a nameable misconception', async () => {
      const prompt = await capturedPrompt()
      expect(prompt).toMatch(/misconception/i)
    })
  })
})

describe('generateOptionExplanations', () => {
  it('returns null when GEMINI_API_KEY is missing', async () => {
    vi.stubEnv('GEMINI_API_KEY', '')
    const { generateOptionExplanations } = await importLib()
    const out = await generateOptionExplanations({
      subject: 'Math', topic: 'Algebra', question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0,
    })
    expect(out).toBeNull()
  })

  it('returns null when options.length !== 4 or correctIndex is out of range', async () => {
    const { generateOptionExplanations } = await importLib()
    expect(await generateOptionExplanations({
      subject: 'S', topic: 'T', question: 'Q', options: ['A', 'B', 'C'], correctIndex: 0,
    })).toBeNull()
    expect(await generateOptionExplanations({
      subject: 'S', topic: 'T', question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 9,
    })).toBeNull()
    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  it('maps A/B/C/D keys to option_explanations aligned with the input order, null at correctIndex', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => JSON.stringify({
          B: 'B is wrong because...', C: 'C is wrong because...', D: 'D is wrong because...',
          strategy_tip: 'Plug the answer back in.',
        }),
      },
    })
    const { generateOptionExplanations } = await importLib()
    const out = await generateOptionExplanations({
      subject: 'Math', topic: 'Algebra', question: 'Q?',
      options: ['Correct', 'Wrong B', 'Wrong C', 'Wrong D'],
      correctIndex: 0,
    })
    expect(out).not.toBeNull()
    expect(out!.optionExplanations).toEqual([null, 'B is wrong because...', 'C is wrong because...', 'D is wrong because...'])
    expect(out!.strategyTip).toBe('Plug the answer back in.')
  })

  it('returns null when Gemini returns nothing useful (all-empty)', async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify({}) } })
    const { generateOptionExplanations } = await importLib()
    const out = await generateOptionExplanations({
      subject: 'S', topic: 'T', question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0,
    })
    expect(out).toBeNull()
  })

  it('returns null on malformed JSON', async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => 'not json' } })
    const { generateOptionExplanations } = await importLib()
    const out = await generateOptionExplanations({
      subject: 'S', topic: 'T', question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0,
    })
    expect(out).toBeNull()
  })

  it('returns null when Gemini throws', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('network down'))
    const { generateOptionExplanations } = await importLib()
    const out = await generateOptionExplanations({
      subject: 'S', topic: 'T', question: 'Q', options: ['A', 'B', 'C', 'D'], correctIndex: 0,
    })
    expect(out).toBeNull()
  })
})
