import React from 'react'
import { render, screen, act, fireEvent } from '@testing-library/react-native'
import DueReviewScreen from '../index'

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

// iOS redesign P4: the due queue is a self-graded card stack. Shallow-render
// it (keeping the real toStackCards) so the test asserts on WHICH cards (by
// id, in order, with their answers) and which deckId sentinel it got.
jest.mock('../../../../components/practice/FlashcardStack', () => ({
  ...jest.requireActual('../../../../components/practice/FlashcardStack'),
  FlashcardStack: ({ cards, title, deckId }: any) => {
    const { Text } = require('react-native')
    return <Text testID="stack">{`${title}|${deckId}|${cards.map((c: any) => `${c.id}:${c.answer}:${c.explanation}`).join(',')}`}</Text>
  },
}))
jest.mock('../../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: () => {
    const { Text } = require('react-native')
    return <Text testID="exam">mcq</Text>
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
    expect(screen.getByText('All caught up')).toBeTruthy()
    expect(screen.getByText('No cards are due for review right now. Come back tomorrow, or practise a topic.')).toBeTruthy()
    expect(screen.queryByTestId('stack')).toBeNull()
  })

  it('launches straight into the card stack (no chooser step) with cards ordered most-overdue first, tagged with the __due__ sentinel', async () => {
    mockGetDueFlashcards.mockResolvedValue([
      { flashcardId: 'c2', topicId: 't1', dueAt: 100 },
      { flashcardId: 'c1', topicId: 't2', dueAt: 200 },
    ])
    mockDbInstance = makeDb([makeCardRow('c1'), makeCardRow('c2')])
    render(<DueReviewScreen />)
    await act(async () => {})

    const stack = screen.getByTestId('stack')
    expect(stack.props.children).toBe('Due today|__due__|c2:Answer c2:Explanation c2,c1:Answer c1:Explanation c1')
    expect(screen.queryByTestId('exam')).toBeNull()
  })

  it('the empty state offers one way back, a named button (no glyph)', async () => {
    mockGetDueFlashcards.mockResolvedValue([])
    mockDbInstance = makeDb([])
    render(<DueReviewScreen />)
    await act(async () => {})
    const { router } = require('expo-router')
    expect(screen.queryByText(/←/)).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Back to Practice' }))
    expect(router.back).toHaveBeenCalled()
  })
})

describe('DueReviewScreen — loading (redesign M3)', () => {
  it('shows a labelled skeleton, not a bare loading line, while the queue loads', () => {
    mockGetDueFlashcards.mockReturnValue(new Promise(() => {}))
    mockDbInstance = makeDb([])
    render(<DueReviewScreen />)
    expect(screen.getByLabelText('Loading due cards')).toBeTruthy()
    expect(screen.queryByText('Loading due cards…')).toBeNull()
  })
})
