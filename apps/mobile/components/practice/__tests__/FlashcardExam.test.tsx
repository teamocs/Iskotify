import React from 'react'
import { render, fireEvent, screen, act } from '@testing-library/react-native'
import { Share } from 'react-native'
import { FlashcardExam } from '../FlashcardExam'
import type { QuizQuestion } from '../../../utils/mcDistractors'

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

jest.mock('../../../services/questionReports', () => ({
  submitQuestionReport: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../../../hooks/useRecordSession', () => ({
  useRecordSession: jest.fn(),
}))

jest.mock('../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: jest.fn(),
}))

jest.mock('../../../hooks/useRecordProgress', () => ({
  useRecordProgress: jest.fn(),
}))

jest.mock('../../../hooks/useRecordSrs', () => ({
  useRecordSrs: jest.fn(),
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

const mockDb = { __mock: 'db' }

const mockRecordSession = jest.fn().mockResolvedValue(undefined)
const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
const mockRecordProgress = jest.fn().mockResolvedValue(undefined)
const mockRecordSrs = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  jest.clearAllMocks()

  const { useDb } = require('../../../hooks/useDb')
  ;(useDb as jest.Mock).mockReturnValue(mockDb)

  const { useRecordSession } = require('../../../hooks/useRecordSession')
  ;(useRecordSession as jest.Mock).mockReturnValue({ recordSession: mockRecordSession })

  const { useRecordAttempts } = require('../../../hooks/useRecordAttempts')
  ;(useRecordAttempts as jest.Mock).mockReturnValue({ recordAttempts: mockRecordAttempts })

  const { useRecordProgress } = require('../../../hooks/useRecordProgress')
  ;(useRecordProgress as jest.Mock).mockReturnValue({ recordProgress: mockRecordProgress })

  const { useRecordSrs } = require('../../../hooks/useRecordSrs')
  ;(useRecordSrs as jest.Mock).mockReturnValue({ recordSrs: mockRecordSrs })

  const { submitQuestionReport } = require('../../../services/questionReports')
  ;(submitQuestionReport as jest.Mock).mockResolvedValue(undefined)
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

  it('9. submit writes a question_attempts row per question and a user_progress row per card (Task D)', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Q1 correct, Q2 correct, Q3 WRONG (index 0 = "Red", correct is index 1)
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Red'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(mockRecordAttempts).toHaveBeenCalledTimes(1)
    const attemptRows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(attemptRows).toHaveLength(3)
    expect(attemptRows.map(r => r.questionId)).toEqual(['q1', 'q2', 'q3'])
    expect(attemptRows[0]).toMatchObject({ sourceTable: 'flashcards', listingSlug: 'test-listing', correctIndex: 1, selectedIndex: 1, correct: true })
    expect(attemptRows[2]).toMatchObject({ correctIndex: 1, selectedIndex: 0, correct: false })

    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
    const progressRows = mockRecordProgress.mock.calls[0]![0] as any[]
    expect(progressRows).toEqual([
      { flashcardId: 'q1', correct: true, answeredAt: expect.any(Number) },
      { flashcardId: 'q2', correct: true, answeredAt: expect.any(Number) },
      { flashcardId: 'q3', correct: false, answeredAt: expect.any(Number) },
    ])
  })

  it('12. submit calls recordSrs (Task H) with one row per card carrying correctness + elapsed time', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Red')) // wrong

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(mockRecordSrs).toHaveBeenCalledTimes(1)
    const srsRows = mockRecordSrs.mock.calls[0]![0] as any[]
    expect(srsRows).toHaveLength(3)
    expect(srsRows[0]).toMatchObject({ flashcardId: 'q1', correct: true })
    expect(srsRows[2]).toMatchObject({ flashcardId: 'q3', correct: false })
    expect(srsRows.every(r => typeof r.elapsedMs === 'number')).toBe(true)
  })

  it('13. a rejected recordSrs never breaks submit — the results screen still renders (fire-and-forget/error-isolated)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordSrs.mockRejectedValueOnce(new Error('SQLITE_BUSY'))

    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Blue'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    // Submit still completed — results screen rendered, recordSession still fired.
    expect(screen.getByText('100%')).toBeTruthy()
    expect(mockRecordSession).toHaveBeenCalled()

    // Let the rejected recordSrs promise settle and be swallowed.
    await new Promise(r => setTimeout(r, 0))
    expect(warnSpy).toHaveBeenCalledWith('[FlashcardExam] recordSrs failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('10. a question left unanswered (Skip to the end, Submit) writes a null-selectedIndex attempt row', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Skip Q1 unanswered, answer Q2, skip to Q3 and submit without answering it.
    fireEvent.press(screen.getByText('Skip'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    const attemptRows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(attemptRows[0]).toMatchObject({ selectedIndex: null, correct: false })
    expect(attemptRows[2]).toMatchObject({ selectedIndex: null, correct: false })
  })

  it('11. retaking after a submit resets the sessionKey and timing baseline (does not carry over attempt 1\'s elapsed time)', async () => {
    // Deterministic clock: FlashcardExam has no interval timers of its own, so
    // fully controlling Date.now() lets us prove the retake reset precisely
    // instead of relying on real elapsed wall-clock time in a fast test run.
    let t = 1_000_000
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => t)

    render(<FlashcardExam {...DEFAULT_PROPS} />)
    const tick = () => { t += 100 }

    tick(); fireEvent.press(screen.getByText('4'))
    tick(); fireEvent.press(screen.getByText('Next'))
    tick(); fireEvent.press(screen.getByText('Manila'))
    tick(); fireEvent.press(screen.getByText('Next'))
    tick(); fireEvent.press(screen.getByText('Blue'))
    tick()
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })
    const firstCall = mockRecordAttempts.mock.calls[0]![0] as any[]
    const firstSessionKey = firstCall[0].sessionKey

    t += 5000 // idle time on the results screen before retaking
    await act(async () => {
      fireEvent.press(screen.getByText('Retake exam'))
    })

    tick(); fireEvent.press(screen.getByText('4'))
    tick(); fireEvent.press(screen.getByText('Next'))
    tick(); fireEvent.press(screen.getByText('Manila'))
    tick(); fireEvent.press(screen.getByText('Next'))
    tick(); fireEvent.press(screen.getByText('Blue'))
    tick()
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(mockRecordAttempts).toHaveBeenCalledTimes(2)
    const secondCall = mockRecordAttempts.mock.calls[1]![0] as any[]
    expect(secondCall[0].sessionKey).toBeGreaterThan(firstSessionKey)
    // Bug this guards against: if timingRef/attemptStartRef weren't reset on
    // retake, attempt 2's rows would carry over the ~5000ms results-screen
    // idle gap plus all of attempt 1's dwell time onto idx 0.
    const secondTotalElapsed = secondCall.reduce((sum: number, r: any) => sum + r.elapsedMs, 0)
    expect(secondTotalElapsed).toBeLessThan(1000)

    dateSpy.mockRestore()
  })

  it('finding #2: a rejected recordAttempts insert still reaches the results screen (telemetry is best-effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordAttempts.mockRejectedValueOnce(new Error('disk full'))

    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Blue'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(screen.getByText('100%')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalledWith('[FlashcardExam] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('finding #2: the submittedRef guard blocks a rapid re-tap of Submit from double-inserting attempt/progress rows', async () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Manila'))
    fireEvent.press(screen.getByText('Next'))
    fireEvent.press(screen.getByText('Blue'))

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
      fireEvent.press(screen.getByText('Submit')) // rapid re-tap before the first submit() settles
    })

    expect(mockRecordAttempts).toHaveBeenCalledTimes(1)
    expect(mockRecordProgress).toHaveBeenCalledTimes(1)
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

  it('6. ⚐ Report opens the reason modal; submitting reports with reason + snapshot and shows "Reported ✓"', async () => {
    const { submitQuestionReport } = require('../../../services/questionReports')
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    // Open the report modal from Q1
    fireEvent.press(screen.getByText('⚐ Report'))
    expect(screen.getByText('Report this question')).toBeTruthy()

    // No report submitted yet
    expect(submitQuestionReport).not.toHaveBeenCalled()

    // Pick a preset reason and submit
    fireEvent.press(screen.getByText('Wrong answer'))
    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(submitQuestionReport).toHaveBeenCalledTimes(1)
    expect(submitQuestionReport).toHaveBeenCalledWith(mockDb, {
      questionId: 'q1',
      sourceTable: 'flashcards',
      questionText: 'What is 2 + 2?',
      reason: 'Wrong answer',
    })

    // The reported state replaces the report button for this question
    expect(screen.getByText('Reported ✓')).toBeTruthy()
    expect(screen.queryByText('⚐ Report')).toBeNull()
  })

  it('8. selecting an option exposes accessibilityState={{selected:true}} on that option only', () => {
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('4'))

    const buttons = screen.getAllByRole('button')
    const optionButtons = buttons.filter(b => b.props.accessibilityState?.selected !== undefined)
    expect(optionButtons).toHaveLength(4)
    const selected = optionButtons.filter(b => b.props.accessibilityState?.selected === true)
    expect(selected).toHaveLength(1)
  })

  it('7. cancelling the report modal does not submit and keeps the report button', async () => {
    const { submitQuestionReport } = require('../../../services/questionReports')
    render(<FlashcardExam {...DEFAULT_PROPS} />)

    fireEvent.press(screen.getByText('⚐ Report'))
    await act(async () => {
      fireEvent.press(screen.getByText('Cancel'))
    })

    expect(submitQuestionReport).not.toHaveBeenCalled()
    expect(screen.getByText('⚐ Report')).toBeTruthy()
    expect(screen.queryByText('Reported ✓')).toBeNull()
  })
})
