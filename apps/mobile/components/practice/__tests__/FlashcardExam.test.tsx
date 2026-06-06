import React from 'react'
import { render, fireEvent, screen, act } from '@testing-library/react-native'
import { Share } from 'react-native'
import { FlashcardExam } from '../FlashcardExam'
import type { QuizQuestion } from '../../../utils/mcDistractors'

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

jest.mock('../../../hooks/useRecordSession', () => ({
  useRecordSession: jest.fn(),
}))

// QuestionNavigator uses ScrollView + useTheme; render it shallowly
jest.mock('../../upcat/QuestionNavigator', () => ({
  QuestionNavigator: ({ total, currentIdx }: { total: number; currentIdx: number }) => {
    const { Text } = require('react-native')
    return <Text testID="qnav">{`Q${currentIdx + 1}/${total}`}</Text>
  },
}))

// SafeAreaView — just render children
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}))

jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as any)

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockInsert = jest.fn().mockReturnValue({
  values: jest.fn().mockResolvedValue(undefined),
})

const mockRecordSession = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  jest.clearAllMocks()

  const { useDb } = require('../../../hooks/useDb')
  ;(useDb as jest.Mock).mockReturnValue({
    insert: mockInsert,
  })

  const { useRecordSession } = require('../../../hooks/useRecordSession')
  ;(useRecordSession as jest.Mock).mockReturnValue({ recordSession: mockRecordSession })
})

const QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    stem: 'What is 2 + 2?',
    options: ['3', '4', '5', '6'],
    answerIndex: 1,
    explanation: 'Basic arithmetic.',
  },
  {
    id: 'q2',
    stem: 'Capital of the Philippines?',
    options: ['Cebu', 'Davao', 'Manila', 'Makati'],
    answerIndex: 2,
    explanation: 'Manila is the capital.',
  },
  {
    id: 'q3',
    stem: 'Color of the sky?',
    options: ['Red', 'Blue', 'Green', 'Yellow'],
    answerIndex: 1,
    explanation: 'The sky appears blue.',
  },
]

const DEFAULT_PROPS = {
  title: 'Sample Exam',
  questions: QUESTIONS,
  listingSlug: 'test-listing',
  onExit: jest.fn(),
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('FlashcardExam', () => {
  it('1. selecting an option does NOT auto-advance — still shows Q1, Next button present', () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Verify Q1 stem is visible
    expect(screen.getByText('What is 2 + 2?')).toBeTruthy()

    // Tap option "4" (index 1)
    fireEvent.press(screen.getByText('4'))

    // Still on Q1 — stem still visible, Q2 stem NOT visible
    expect(screen.getByText('What is 2 + 2?')).toBeTruthy()
    expect(screen.queryByText('Capital of the Philippines?')).toBeNull()

    // Next button is present
    expect(screen.getByText('Next')).toBeTruthy()
  })

  it('2. pressing Next advances to Q2', () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Answer Q1 then press Next
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))

    // Now on Q2
    expect(screen.getByText('Capital of the Philippines?')).toBeTruthy()
    expect(screen.queryByText('What is 2 + 2?')).toBeNull()
  })

  it('3. answering all + Submit shows the results screen with score', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Q1 — answer correctly (index 1 = "4")
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))

    // Q2 — answer correctly (index 2 = "Manila")
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))

    // Q3 — answer correctly (index 1 = "Blue"); last question → Submit button
    fireEvent.press(screen.getByText('Blue'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    // Results screen: score 3/3 = 100%
    expect(screen.getByText('100%')).toBeTruthy()
    expect(screen.getByText('3/3 correct')).toBeTruthy()
    expect(mockRecordSession).toHaveBeenCalledWith(
      expect.objectContaining({ score: 3, total: 3, listingSlug: 'test-listing' }),
    )
  })

  it('4. "Retake exam" returns to Q1', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Answer all and submit
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Blue'))
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    // On results — press Retake
    await act(async () => {
      fireEvent.press(screen.getByText('Retake exam'))
    })

    // Back to Q1
    expect(screen.getByText('What is 2 + 2?')).toBeTruthy()
    expect(screen.queryByText('100%')).toBeNull()
  })

  it('5. "Share score" calls Share.share with the correct message', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Answer all and submit
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Blue'))
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    await act(async () => {
      fireEvent.press(screen.getByText('Share score'))
    })

    expect(Share.share).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Sample Exam') }),
    )
  })

  it('renders "No questions available" when questions array is empty', () => {
    render(<FlashcardExam {...DEFAULT_PROPS} questions={[]} />)
    expect(screen.getByText('No questions available')).toBeTruthy()
  })
})
