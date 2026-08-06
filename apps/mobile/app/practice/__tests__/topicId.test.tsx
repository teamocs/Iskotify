import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import QuizScreen from '../[topicId]'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ topicId: 't1', listingSlug: undefined }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

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

function makeCardRow(id: string) {
  return {
    id,
    question: `Question ${id}`,
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
    fireEvent.press(screen.getByText('Due today (2)'))

    expect(screen.getByTestId('exam').props.children).toBe('exam:c2,c1')
  })
})
