import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import DeckQuizScreen from '../[deckId]'

// Redesign M3: a saved deck starts the same way a topic does — the deck name
// is the h1, one recommended way in with the only primary button, the other
// modes as rows, and an empty state with one way back (no "← Back" glyph).

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ deckId: 'd1', listingSlug: undefined }),
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: ({ questions }: any) => {
    const { Text } = require('react-native')
    return <Text testID="exam">{`exam:${questions.map((q: any) => q.id).join(',')}`}</Text>
  },
}))
const mockGetDue = jest.fn()
jest.mock('../../../../services/srsAggregates', () => ({ getDueFlashcards: (...a: any[]) => mockGetDue(...a) }))

const card = (id: string) => ({
  id, question: `Question ${id}`, answer: 'a', explanation: 'e', options: JSON.stringify(['a', 'b', 'c', 'd']),
  correctAnswerIndex: 0, aiOptions: null, aiCorrectIndex: null, aiExplanation: null, aiEnhancedAt: Date.now(),
  optionExplanations: '[]', strategyTip: '',
})

function makeDb(deck: any, cards: any[]) {
  let call = 0
  return {
    select: jest.fn(() => {
      call += 1
      if (call === 1) return { from: () => ({ where: () => ({ limit: () => Promise.resolve(deck ? [deck] : []) }) }) }
      return { from: () => ({ where: () => Promise.resolve(cards) }) }
    }),
  }
}
let mockDb: any
jest.mock('../../../../hooks/useDb', () => ({ useDb: () => mockDb }))

const DECK = { id: 'd1', name: 'Weak spots', topicIds: JSON.stringify(['t1']), createdAt: 1 }

describe('saved deck chooser — redesign M3', () => {
  beforeEach(() => { mockGetDue.mockReset(); mockGetDue.mockResolvedValue([]) })

  it('titles the page with the deck name and recommends the quick set', async () => {
    mockDb = makeDb(DECK, [card('c1'), card('c2')])
    render(<DeckQuizScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'Weak spots' })).toBeTruthy()
    const hero = screen.getByTestId('chooser-recommended')
    fireEvent.press(within(hero).getByRole('button', { name: /Start quick set/ }))
    expect(screen.getByTestId('exam').props.children).toMatch(/^exam:/)
  })

  it('recommends due cards first when some are due', async () => {
    mockDb = makeDb(DECK, [card('c1'), card('c2')])
    mockGetDue.mockResolvedValue([{ flashcardId: 'c2', topicId: 't1', dueAt: 1 }])
    render(<DeckQuizScreen />)
    await act(async () => {})
    fireEvent.press(within(screen.getByTestId('chooser-recommended')).getByRole('button', { name: /Start review/ }))
    expect(screen.getByTestId('exam').props.children).toBe('exam:c2')
  })

  it('shows an empty state with one way back when the deck is missing', async () => {
    mockDb = makeDb(null, [])
    render(<DeckQuizScreen />)
    await act(async () => {})
    expect(screen.getByText('This deck has no questions yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toBeTruthy()
    expect(screen.queryByText(/←/)).toBeNull()
  })
})
