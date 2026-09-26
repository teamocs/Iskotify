import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import QuizScreen from '../[topicId]'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ topicId: 't1', listingSlug: undefined }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

const mockBp = { value: 'compact' as 'compact' | 'medium' | 'expanded' }
jest.mock('../../../hooks/useBreakpoint', () => {
  const actual = jest.requireActual('../../../hooks/useBreakpoint')
  return { ...actual, useBreakpoint: () => mockBp.value }
})

// Shallow-render FlashcardExam so the test asserts on WHICH questions
// (by id, in order) it was launched with — the thing "Due today" controls.
jest.mock('../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: ({ questions }: any) => {
    const { Text } = require('react-native')
    return <Text testID="exam">{`exam:${questions.map((q: any) => q.id).join(',')}`}</Text>
  },
}))

const mockGetDueFlashcards = jest.fn()
jest.mock('../../../services/srsAggregates', () => ({
  getDueFlashcards: (...args: any[]) => mockGetDueFlashcards(...args),
}))

function makeCardRow(id: string, question = `Question ${id}`) {
  return {
    id,
    question,
    answer: `Answer ${id}`,
    explanation: `Explanation ${id}`,
    options: JSON.stringify(['a', 'b', 'c', 'd']),
    correctAnswerIndex: 0,
    aiOptions: null,
    aiCorrectIndex: null,
    aiExplanation: null,
    // Already enhanced — skips the AI-enhancement phase entirely.
    aiEnhancedAt: Date.now(),
    optionExplanations: '[]',
    strategyTip: '',
  }
}

// db.select() is called twice per load(): once for the topic name
// (select().from().where().limit()), once for fetchCards()
// (select().from().where()). Sequence the two shapes by call order.
function makeDb(cardRows: ReturnType<typeof makeCardRow>[]) {
  let call = 0
  return {
    select: jest.fn(() => {
      call += 1
      if (call === 1) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ name: 'Algebra' }]) }) }) }
      }
      return { from: () => ({ where: () => Promise.resolve(cardRows) }) }
    }),
  }
}

let mockDbInstance: any
jest.mock('../../../hooks/useDb', () => ({ useDb: () => mockDbInstance }))

describe('[topicId] chooser — Due today (Task H)', () => {
  beforeEach(() => {
    mockGetDueFlashcards.mockReset()
    mockGetDueFlashcards.mockResolvedValue([])
  })

  it('does not show a "Due today" option when nothing in this topic is due', async () => {
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<QuizScreen />)
    await act(async () => {})
    expect(screen.queryByText(/Due today/)).toBeNull()
    // The ordinary choices are still there.
    expect(screen.getByText('Quick (15)')).toBeTruthy()
    expect(screen.getByText('Full')).toBeTruthy()
  })

  it('shows "Due today (N)" and launches only the due cards, most overdue first', async () => {
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2'), makeCardRow('c3')])
    // c2 is more overdue (smaller dueAt) than c1; c3 is not due at all.
    mockGetDueFlashcards.mockResolvedValue([
      { flashcardId: 'c2', topicId: 't1', dueAt: 100 },
      { flashcardId: 'c1', topicId: 't1', dueAt: 200 },
    ])
    render(<QuizScreen />)
    await act(async () => {})

    expect(screen.getByText('Due today (2)')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: /Start review/ }))

    expect(screen.getByTestId('exam').props.children).toBe('exam:c2,c1')
  })

  it('the "Due today (N)" count matches exactly what the quiz serves when two due cards share a normalized stem (Task H bugfix)', async () => {
    // c1 and c2 are both due AND share a normalized stem — pickQuestions('due', …)
    // dedupes by stem before filtering to due, so only ONE of them can ever be
    // served. The badge must report that same number, not the raw due-id count.
    mockDbInstance = makeDb([
      makeCardRow('c1', 'What is 2+2?'),
      makeCardRow('c2', '  what is 2+2?  '),
    ])
    mockGetDueFlashcards.mockResolvedValue([
      { flashcardId: 'c1', topicId: 't1', dueAt: 100 },
      { flashcardId: 'c2', topicId: 't1', dueAt: 200 },
    ])
    render(<QuizScreen />)
    await act(async () => {})

    const dueEl = screen.getByText(/Due today \(\d+\)/)
    const label = ([] as unknown[]).concat(dueEl.props.children).join('')
    const n = Number(/Due today \((\d+)\)/.exec(label)![1])
    expect(n).toBe(1)

    fireEvent.press(screen.getByRole('button', { name: /Start review/ }))
    const served = screen.getByTestId('exam').props.children as string
    const servedCount = served.replace('exam:', '').split(',').filter(Boolean).length
    expect(servedCount).toBe(n)
  })
})

// Redesign M3: the chooser follows "One Next Step" — the recommended way in is
// a hero with the screen's only primary button; the other modes are rows; the
// topic name is the page's h1; desktop gets a second column of facts.
describe('[topicId] chooser — redesign M3', () => {
  beforeEach(() => {
    mockBp.value = 'compact'
    mockGetDueFlashcards.mockReset()
    mockGetDueFlashcards.mockResolvedValue([])
  })

  it('titles the page with the topic name as the only level-1 heading', async () => {
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<QuizScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'Algebra' })).toBeTruthy()
  })

  it('recommends the due cards first when some are due, with one primary action', async () => {
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    mockGetDueFlashcards.mockResolvedValue([{ flashcardId: 'c1', topicId: 't1', dueAt: 100 }])
    render(<QuizScreen />)
    await act(async () => {})
    const hero = screen.getByTestId('chooser-recommended')
    expect(within(hero).getByText('Due today (1)')).toBeTruthy()
    fireEvent.press(within(hero).getByRole('button', { name: /Start review/ }))
    expect(screen.getByTestId('exam').props.children).toBe('exam:c1')
  })

  it('recommends the quick set when nothing is due, and keeps Full as a row', async () => {
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<QuizScreen />)
    await act(async () => {})
    const hero = screen.getByTestId('chooser-recommended')
    expect(within(hero).getByText('Quick (15)')).toBeTruthy()
    expect(within(hero).queryByText('Full')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: /^Full,/ }))
    expect(screen.getByTestId('exam').props.children).toMatch(/^exam:c[12],c[12]$/)
  })

  it('shows an empty state with one way back when the topic has no questions', async () => {
    mockDbInstance = makeDb([])
    render(<QuizScreen />)
    await act(async () => {})
    expect(screen.getByText('No questions in this topic yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toBeTruthy()
    expect(screen.queryByText(/←/)).toBeNull()
  })

  it('puts the facts beside the options on desktop', async () => {
    mockBp.value = 'expanded'
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<QuizScreen />)
    await act(async () => {})
    const row = screen.getByTestId('two-column')
    expect(row.props.style.flexDirection).toBe('row')
    expect(screen.getByText('In this topic')).toBeTruthy()
  })
})
