import React from 'react'
import { render, screen, act, fireEvent, within } from '@testing-library/react-native'
import ListingQuizScreen from '../[slug]'

// Redesign M3: the listing review chooser shares the topic/deck chooser —
// sentence-case h1, one recommended start, the listing named in the lead,
// and a real empty state (no "← Back" glyph).

const mockParams = { value: { slug: 'upcat', mode: undefined as string | undefined } }
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => mockParams.value,
}))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))
jest.mock('../../../../components/practice/FlashcardExam', () => ({
  FlashcardExam: ({ questions, title }: any) => {
    const { Text } = require('react-native')
    return <Text testID="exam">{`${title}|${questions.length}`}</Text>
  },
}))
jest.mock('../../../../services/srsAggregates', () => ({ getDueFlashcards: jest.fn().mockResolvedValue([]) }))

const card = (id: string, slugs = ['upcat']) => ({
  id, topicId: 't1', question: `Question ${id}`, answer: 'a', explanation: 'e', listingSlugs: JSON.stringify(slugs),
  options: JSON.stringify(['a', 'b', 'c', 'd']), correctAnswerIndex: 0, aiOptions: null, aiCorrectIndex: null,
  aiExplanation: null, aiEnhancedAt: Date.now(), optionExplanations: '[]', strategyTip: '',
})

let mockCards: any[] = []
jest.mock('../../../../hooks/useDb', () => {
  const db = {
    select: (cols: any) => ({
      from: () => {
        // listing title: select({title}).from().where().limit(); cards: select({...}).from(); progress: select().from()
        if (cols && 'title' in cols) return { where: () => ({ limit: () => Promise.resolve([{ title: 'UPCAT' }]) }) }
        if (cols && 'flashcardId' in cols) return Promise.resolve([])
        return Promise.resolve(mockCards)
      },
    }),
  }
  return { useDb: () => db }
})

describe('listing review chooser — redesign M3', () => {
  beforeEach(() => { mockParams.value = { slug: 'upcat', mode: undefined } })

  it('titles the page in sentence case and names the listing in the lead', async () => {
    mockCards = [card('c1'), card('c2'), card('c3', ['acet'])]
    render(<ListingQuizScreen />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'Full review' })).toBeTruthy()
    expect(screen.getByText(/UPCAT · 2 cards to practise/)).toBeTruthy()
  })

  it('starts the quick set from the one primary button', async () => {
    mockCards = [card('c1'), card('c2')]
    render(<ListingQuizScreen />)
    await act(async () => {})
    fireEvent.press(within(screen.getByTestId('chooser-recommended')).getByRole('button', { name: /Start quick set/ }))
    expect(screen.getByTestId('exam').props.children).toBe('Full review · UPCAT|2')
  })

  it('weak mode with nothing weak shows an encouraging empty state with one way back', async () => {
    mockParams.value = { slug: 'upcat', mode: 'weak' }
    mockCards = [card('c1')]
    render(<ListingQuizScreen />)
    await act(async () => {})
    expect(screen.getByText('No weak topics yet')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Back to Practice' })).toBeTruthy()
    expect(screen.queryByText(/←/)).toBeNull()
  })
})
