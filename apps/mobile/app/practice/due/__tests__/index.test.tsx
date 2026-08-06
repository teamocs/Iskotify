import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import DueReviewScreen from '../index'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

// Shallow-render FlashcardExam so the test asserts on WHICH questions (by id,
// in order) and which deckId sentinel it was launched with.
jest.mock('../../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: ({ questions, title, deckId }: any) => {
    const { Text } = require('react-native')
    return <Text testID="exam">{`${title}|${deckId}|${questions.map((q: any) => q.id).join(',')}`}</Text>
  },
}))

const mockGetDueFlashcards = jest.fn()
jest.mock('../../../../services/srsAggregates', () => ({
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
    aiEnhancedAt: Date.now(),
    optionExplanations: '[]',
    strategyTip: '',
  }
}

let mockDbInstance: any
jest.mock('../../../../hooks/useDb', () => ({ useDb: () => mockDbInstance }))

function makeDb(cardRows: ReturnType<typeof makeCardRow>[]) {
  return {
    select: jest.fn(() => ({ from: () => ({ where: () => Promise.resolve(cardRows) }) })),
  }
}

describe('DueReviewScreen (Task H)', () => {
  beforeEach(() => {
    mockGetDueFlashcards.mockReset()
  })

  it('shows the "all caught up" empty state when nothing is due', async () => {
    mockGetDueFlashcards.mockResolvedValue([])
    mockDbInstance = makeDb([])
    render(<DueReviewScreen />)
    await act(async () => {})
    expect(screen.getByText('All caught up!')).toBeTruthy()
    expect(screen.queryByTestId('exam')).toBeNull()
  })

  it('launches straight into the exam (no chooser step) with cards ordered most-overdue first, tagged with the __due__ sentinel', async () => {
    mockGetDueFlashcards.mockResolvedValue([
      { flashcardId: 'c2', topicId: 't1', dueAt: 100 },
      { flashcardId: 'c1', topicId: 't2', dueAt: 200 },
    ])
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<DueReviewScreen />)
    await act(async () => {})

    const exam = screen.getByTestId('exam')
    expect(exam.props.children).toBe('Due Today|__due__|c2,c1')
  })

  it('"← Back" from the empty state navigates back', async () => {
    mockGetDueFlashcards.mockResolvedValue([])
    mockDbInstance = makeDb([])
    render(<DueReviewScreen />)
    await act(async () => {})
    const { router } = require('expo-router')
    fireEvent.press(screen.getByText('← Back'))
    expect(router.back).toHaveBeenCalled()
  })
})
