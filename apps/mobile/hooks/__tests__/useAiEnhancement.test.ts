jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  buildPrompt: jest.fn().mockReturnValue('mock-prompt'),
  runInference: jest.fn(),
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

import { modelExists, runInference } from '../../services/llm'
import { runEnhancement, enhanceCardsByIds } from '../useAiEnhancement'

const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>
const mockRunInference = runInference as jest.MockedFunction<typeof runInference>

function makeMockDb(cards: object[], topicResult: object[], subjectResult: object[]) {
  // `.where()` is awaited directly for the unenhanced query but chained to `.limit()`
  // for topic/subject lookups, so the returned object must be both thenable and chainable.
  function makeWhereResult(arrayResult: object[], limitResult: object[]) {
    const thenable = Promise.resolve(arrayResult) as Promise<object[]> & { limit: jest.Mock }
    thenable.limit = jest.fn().mockResolvedValue(limitResult)
    return thenable
  }

  let tableSeen: 'flashcards' | 'topics' | 'subjects' = 'flashcards'

  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockImplementation((table: unknown) => {
        const name = (table as { _?: { name?: string } })?._?.name
        tableSeen = name === 'topics' ? 'topics' : name === 'subjects' ? 'subjects' : 'flashcards'
        return {
          where: jest.fn().mockImplementation(() => {
            const limitResult =
              tableSeen === 'topics' ? topicResult :
              tableSeen === 'subjects' ? subjectResult : cards
            return makeWhereResult(cards, limitResult)
          }),
        }
      }),
    })),
    update: jest.fn().mockReturnValue({
      set: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue(undefined),
      }),
    }),
  } as unknown as Parameters<typeof runEnhancement>[0]
}

describe('runEnhancement', () => {
  beforeEach(() => jest.clearAllMocks())

  it('skips entirely when model does not exist', async () => {
    mockModelExists.mockResolvedValue(false)
    const db = makeMockDb([], [], [])
    await runEnhancement(db)
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('skips cards that already have aiEnhancedAt set', async () => {
    mockModelExists.mockResolvedValue(true)
    const db = makeMockDb([], [], [])
    await runEnhancement(db)
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('skips card gracefully when inference returns null', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue(null)
    await expect(runEnhancement(makeMockDb([], [], []))).resolves.not.toThrow()
  })
})

describe('enhanceCardsByIds', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns immediately with empty result when no ids passed', async () => {
    mockModelExists.mockResolvedValue(true)
    const db = makeMockDb([], [], [])
    const result = await enhanceCardsByIds(db, [])
    expect(result).toEqual({ enhanced: [], skipped: [], modelReady: false })
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('returns modelReady=false and skips inference when model is not downloaded', async () => {
    mockModelExists.mockResolvedValue(false)
    const db = makeMockDb([], [], [])
    const result = await enhanceCardsByIds(db, ['c1', 'c2'])
    expect(result.modelReady).toBe(false)
    expect(result.enhanced).toEqual([])
    expect(result.skipped).toEqual(['c1', 'c2'])
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('invokes progress callback with done/total per card', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue({
      wrong_option_1: 'A', wrong_option_2: 'B', wrong_option_3: 'C', explanation: 'x',
    })
    const cards = [
      { id: 'c1', topicId: 't1', question: 'Q1', answer: 'Correct1' },
      { id: 'c2', topicId: 't1', question: 'Q2', answer: 'Correct2' },
    ]
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'Math' }] :
                name === 'subjects' ? [{ name: 'Math' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    }
    const progressEvents: Array<{ done: number; total: number }> = []
    await enhanceCardsByIds(db, ['c1', 'c2'], p => progressEvents.push(p))
    // Initial 0/N, then 1/N, then 2/N
    expect(progressEvents[0]).toEqual({ done: 0, total: 2 })
    expect(progressEvents[progressEvents.length - 1]).toEqual({ done: 2, total: 2 })
  })

  it('returns enhanced+skipped IDs based on per-card LLM outcome', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference
      .mockResolvedValueOnce({ wrong_option_1: 'A', wrong_option_2: 'B', wrong_option_3: 'C', explanation: 'ok' })
      .mockResolvedValueOnce(null) // skipped — model rejected this card
    const cards = [
      { id: 'good', topicId: 't1', question: 'Q1', answer: 'Correct1' },
      { id: 'bad', topicId: 't1', question: 'Q2', answer: 'Correct2' },
    ]
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'T' }] :
                name === 'subjects' ? [{ name: 'S' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }) }),
    }
    const result = await enhanceCardsByIds(db, ['good', 'bad'])
    expect(result.modelReady).toBe(true)
    expect(result.enhanced).toEqual(['good'])
    expect(result.skipped).toEqual(['bad'])
  })
})

describe('finding #1: stale explanations paired with locally-generated aiOptions', () => {
  beforeEach(() => jest.clearAllMocks())

  it('skips a card that already has 4 admin-authored options — Gemma distractors never overwrite curated ones', async () => {
    mockModelExists.mockResolvedValue(true)
    const updateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    const cards = [{
      id: 'c1', topicId: 't1', question: 'Capital of France?', answer: 'Paris',
      options: JSON.stringify(['Paris', 'London', 'Rome', 'Berlin']),
      correctAnswerIndex: 0,
    }]
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'Geography' }] :
                name === 'subjects' ? [{ name: 'Geography' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: updateSet }),
    }
    const result = await enhanceCardsByIds(db, ['c1'])
    expect(mockRunInference).not.toHaveBeenCalled()
    expect(updateSet).not.toHaveBeenCalled()
    expect(result.enhanced).toEqual([])
    expect(result.skipped).toEqual(['c1'])
  })

  it('still enhances a card with fewer than 4 admin options', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue({
      wrong_option_1: 'A', wrong_option_2: 'B', wrong_option_3: 'C', explanation: 'x',
    })
    const updateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    const cards = [{
      id: 'c1', topicId: 't1', question: 'Capital of France?', answer: 'Paris',
      options: JSON.stringify(['Paris']),
      correctAnswerIndex: 0,
    }]
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'Geography' }] :
                name === 'subjects' ? [{ name: 'Geography' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: updateSet }),
    }
    await enhanceCardsByIds(db, ['c1'])
    expect(mockRunInference).toHaveBeenCalled()
    expect(updateSet).toHaveBeenCalled()
  })

  it('clears optionExplanations/strategyTip on the enhanced card so no stale rationale can render', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue({
      wrong_option_1: 'A', wrong_option_2: 'B', wrong_option_3: 'C', explanation: 'x',
    })
    const updateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    const cards = [{ id: 'c1', topicId: 't1', question: 'Capital of France?', answer: 'Paris' }]
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'Geography' }] :
                name === 'subjects' ? [{ name: 'Geography' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: updateSet }),
    }
    await enhanceCardsByIds(db, ['c1'])
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ optionExplanations: '[]', strategyTip: '' }),
    )
  })
})

describe('shuffleWithCorrect bug regression', () => {
  beforeEach(() => jest.clearAllMocks())

  it('skips card when all 3 distractors equal the correct answer', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue({
      wrong_option_1: 'Paris',
      wrong_option_2: 'Paris',
      wrong_option_3: 'Paris',
      explanation: 'x',
    })
    const cards = [{ id: 'c1', topicId: 't1', question: 'Capital of France?', answer: 'Paris' }]
    const updateSet = jest.fn().mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) })
    const db: any = {
      select: jest.fn().mockImplementation(() => ({
        from: jest.fn().mockImplementation((table: any) => {
          const name = table?._?.name
          return {
            where: jest.fn().mockImplementation(() => {
              const limitData =
                name === 'topics' ? [{ subjectId: 's1', topicName: 'Geography' }] :
                name === 'subjects' ? [{ name: 'Geography' }] : cards
              const thenable: any = Promise.resolve(cards)
              thenable.limit = jest.fn().mockResolvedValue(limitData)
              return thenable
            }),
          }
        }),
      })),
      update: jest.fn().mockReturnValue({ set: updateSet }),
    }
    await runEnhancement(db)
    // The card should have been skipped (model echoed the answer 3 times)
    expect(updateSet).not.toHaveBeenCalled()
  })
})
