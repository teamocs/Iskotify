jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  buildPrompt: jest.fn().mockReturnValue('mock-prompt'),
  runInference: jest.fn(),
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

import { modelExists, runInference } from '../../services/llm'
import { runEnhancement } from '../useAiEnhancement'

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
