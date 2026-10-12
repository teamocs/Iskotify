import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'
import { primaryActions } from '../../../../test-utils/primaryActions'
import { aria } from '../../../../test-utils/aria'

// Redesign M2 — the runner's focus-mode layout. The exam-safety behaviour
// (leave guard, auto-save/resume, review-before-submit, neutral results) is
// covered by slug.test.tsx and is deliberately not duplicated here.

const mockRouterBack = jest.fn()
const mockRouterReplace = jest.fn()
jest.mock('expo-router', () => ({
  router: { push: () => {}, replace: (...a: unknown[]) => mockRouterReplace(...a), back: (...a: unknown[]) => mockRouterBack(...a) },
  useLocalSearchParams: () => ({ slug: 'test-mock' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

let mockBp: 'compact' | 'medium' | 'expanded' = 'compact'
jest.mock('../../../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

jest.mock('../../../../services/questionReports', () => ({
  submitQuestionReport: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('../../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})
jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: jest.fn(() => Promise.resolve()) }),
}))
jest.mock('../../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: jest.fn().mockResolvedValue(undefined) }),
}))
jest.mock('../../../../hooks/useAdmissionEstimate', () => ({
  loadAdmissionEstimateSnapshot: jest.fn().mockResolvedValue({ status: 'not-ready', readiness: null, result: null }),
}))

const mockGetExamBlueprint = jest.fn()
const mockGetQuestionsByCategory = jest.fn()
jest.mock('../../../../services/examBlueprints', () => ({
  getExamBlueprint: (...a: unknown[]) => mockGetExamBlueprint(...a),
  getQuestionsByCategory: (...a: unknown[]) => mockGetQuestionsByCategory(...a),
  getAllPassages: jest.fn().mockResolvedValue([]),
  getTargetCourseClusters: jest.fn().mockResolvedValue([]),
}))
jest.mock('../../../../hooks/usePreventLeave', () => ({ usePreventLeave: jest.fn() }))
jest.mock('../../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({
    saveRun: jest.fn().mockResolvedValue(undefined),
    loadRun: jest.fn().mockResolvedValue(null),
    clearRun: jest.fn().mockResolvedValue(undefined),
  }),
}))

const BLUEPRINT: ExamBlueprint = {
  slug: 'test-mock', name: 'Test Mock', acronym: 'TM', totalItems: 2, totalTimeMinutes: 30,
  hasGuessingPenalty: false, guessingPenalty: 0.25, sectionBlocked: false,
  scoringNote: '', mechanicsNote: '',
  sections: [{ id: 'sec1', name: 'Math', skillCategory: 'quant', itemCount: 2, timeMinutes: 30, requiresSpatialLogic: false, displayOrder: 0 }],
  courseNotes: [],
}
const Q1: RawUpcatQuestion = {
  questionId: 'Q1', subtest: 'Mathematics', questionText: '1+1?',
  options: ['1', '2', '3', '4'], correctIndex: 1, explanation: '',
  setId: null, setPosition: null, mainSubject: 'Math', topic: 'Arithmetic',
}
const Q2: RawUpcatQuestion = {
  questionId: 'Q2', subtest: 'Mathematics', questionText: '2+2?',
  options: ['1', '2', '3', '4'], correctIndex: 3, explanation: '',
  setId: null, setPosition: null, mainSubject: 'Math', topic: 'Geometry',
}

async function startExam() {
  render(<BlueprintExam />)
  await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
  fireEvent.press(screen.getByText('Full Mock'))
  await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
}

describe('BlueprintExam focus mode (redesign M2)', () => {
  let randomSpy: jest.SpyInstance
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    // Fake timers make every waitFor/findBy deadline count fake time, which
    // RNTL advances itself while polling. On real timers the 1s deadline was
    // wall-clock, so a CPU-starved CI runner could time out while the (fully
    // mocked, promise-only) load was still in flight.
    jest.useFakeTimers()
    mockBp = 'compact'
    mockRouterBack.mockClear()
    mockRouterReplace.mockClear()
    mockGetExamBlueprint.mockReset().mockResolvedValue(BLUEPRINT)
    mockGetQuestionsByCategory.mockReset().mockResolvedValue(new Map([['quant', [Q1, Q2]]]))
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    randomSpy.mockRestore()
    alertSpy.mockRestore()
    jest.useRealTimers()
  })

  describe('prestart', () => {
    it('states the mock size and length as numbers, and offers Full Mock and Study Sprint', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(screen.getByLabelText('Items: 2')).toBeTruthy()
      expect(screen.getByLabelText('Time: 30 min')).toBeTruthy()
      expect(screen.getByRole('button', { name: /Study Sprint/ })).toBeTruthy()
    })

    it('has a named back control', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByRole('button', { name: 'Back' }))
      expect(mockRouterBack).toHaveBeenCalled()
    })
  })

  describe('load states', () => {
    it('shows a retryable error (not the empty state) when loading fails', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
      mockGetExamBlueprint.mockRejectedValueOnce(new Error('offline'))
      render(<BlueprintExam />)
      expect(await screen.findByText("Couldn't load this mock exam")).toBeTruthy()
      expect(warn).toHaveBeenCalledWith('[exam/[slug]] load failed:', expect.any(Error))
      warn.mockRestore()
      fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
      // The retry goes back through the loading state before the prestart.
      expect(screen.getByLabelText('Loading mock exam')).toBeTruthy()
      expect(await screen.findByText('Full Mock')).toBeTruthy()
      expect(mockGetExamBlueprint).toHaveBeenCalledTimes(2)
    })

    it('shows an empty state with a way back when the mock has no questions yet', async () => {
      mockGetExamBlueprint.mockResolvedValue(null)
      render(<BlueprintExam />)
      expect(await screen.findByText("This mock isn't ready yet")).toBeTruthy()
      fireEvent.press(screen.getByRole('button', { name: 'Back to mock exams' }))
      expect(mockRouterBack).toHaveBeenCalled()
    })
  })

  describe('runner', () => {
    it('orients the student with "Question n of N" and an answered-progress bar', async () => {
      await startExam()
      expect(screen.getByText('Question 1 of 2')).toBeTruthy()
      const bar = screen.getByRole('progressbar', { name: 'Answered 0 of 2' })
      expect(bar.props.accessibilityValue).toMatchObject({ now: 0 })
      fireEvent.press(screen.getByText('4'))
      expect(screen.getByRole('progressbar', { name: 'Answered 1 of 2' }).props.accessibilityValue).toMatchObject({ now: 50 })
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeTruthy())
    })

    it('reads the time left as a named, tabular timer', async () => {
      await startExam()
      expect(screen.getByLabelText(/^Time left: \d+:\d{2}$/)).toBeTruthy()
    })

    it('has a 44pt, named Leave control in the header', async () => {
      await startExam()
      const leave = screen.getByRole('button', { name: 'Leave exam' })
      const flat = Object.assign({}, ...[leave.props.style].flat(Infinity).filter(Boolean))
      expect(flat.minWidth ?? flat.width).toBeGreaterThanOrEqual(44)
      fireEvent.press(leave)
      expect(mockRouterBack).toHaveBeenCalled()
    })

    it('opens the question overview from the header at any point, without submitting', async () => {
      await startExam()
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      expect(await screen.findByText('Review your answers')).toBeTruthy()
      expect(screen.getByText('2+2?')).toBeTruthy()
    })

    it('keeps the question navigator out of the phone layout', async () => {
      await startExam()
      expect(screen.queryByTestId('question-nav-panel')).toBeNull()
    })

    it('adds the question navigator as a side panel on expanded widths', async () => {
      mockBp = 'expanded'
      await startExam()
      expect(screen.getByTestId('question-nav-panel')).toBeTruthy()
      fireEvent.press(screen.getByLabelText('Question 2, unanswered'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    })

    it('caps the reading column at 720 on wide screens', async () => {
      mockBp = 'expanded'
      await startExam()
      const col = screen.getByTestId('exam-reading-column')
      const flat = Object.assign({}, ...[col.props.style].flat(Infinity).filter(Boolean))
      expect(flat.maxWidth).toBeLessThanOrEqual(720)
      // On wide screens the options follow the question inside that column.
      expect(within(col).getByText('4')).toBeTruthy()
    })
  })

  describe('results', () => {
    it('opens with a calm English close and shows the by-skill breakdown', async () => {
      await startExam()
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('2'))
      fireEvent.press(screen.getByText('Review'))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })

      expect(await screen.findByRole('header', { name: 'Mock complete.' })).toBeTruthy()
      expect(screen.getByRole('progressbar', { name: 'Math score' })).toBeTruthy()
      expect(screen.getByText('2 of 2 correct')).toBeTruthy()
    })

    // Review finding (HIGH): react-native-web 0.21 ignores the nested
    // accessibilityState prop, so the accordion's expanded state never reached
    // the DOM. It now travels as aria-expanded.
    it('exposes the review accordion expanded state as aria-expanded', async () => {
      await startExam()
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })
      await screen.findByRole('header', { name: 'Mock complete.' })

      const header = () => screen.UNSAFE_getAllByProps({ accessibilityLabel: 'Math, 1 to review' })
        .find(n => typeof n.type !== 'string')!
      expect(header().props['aria-expanded']).toBe(false)
      expect(screen.getByRole('button', { name: 'Math, 1 to review', expanded: false })).toBeTruthy()

      fireEvent.press(screen.getByRole('button', { name: 'Math, 1 to review' }))
      expect(header().props['aria-expanded']).toBe(true)
      expect(screen.getByRole('button', { name: 'Math, 1 to review', expanded: true })).toBeTruthy()
    })
  })

  // ── iOS redesign P4: the question screen and results in the iOS language ──
  describe('iOS redesign P4', () => {
    async function submitFromSheet() {
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })
      await screen.findByRole('header', { name: 'Mock complete.' })
    }

    it('has exactly one primary action on the prestart, the question screen and the results', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(primaryActions()).toEqual(['Full Mock'])
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      expect(primaryActions()).toEqual(['Skip'])
      fireEvent.press(screen.getByRole('radio', { name: '4' }))
      expect(primaryActions()).toEqual(['Next'])
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      // The last question: Review opens the sheet, it never submits.
      expect(primaryActions()).toEqual(['Review'])
      fireEvent.press(screen.getByText('Review'))
      await submitFromSheet()
      act(() => { jest.advanceTimersByTime(500) }) // let the review sheet finish its exit
      expect(primaryActions()).toEqual(['Review 1 answer'])
    })

    it('shows the time in a timer capsule: role timer, tabular figures', async () => {
      await startExam()
      const timer = screen.getByRole('timer')
      expect(timer.props.accessibilityLabel).toMatch(/^Time left: \d+:\d{2}$/)
      const digits = within(timer).getByText(/^\d+:\d{2}$/)
      expect(Object.assign({}, ...[digits.props.style].flat(Infinity).filter(Boolean)).fontVariant).toEqual(['tabular-nums'])
    })

    it('puts close, the centred subtest and "Question N of M" (tabular), and a flag on the glass top bar', async () => {
      await startExam()
      const bar = screen.getByTestId('runner-top-bar')
      expect(within(bar).getByRole('button', { name: 'Leave exam' })).toBeTruthy()
      expect(within(bar).getByText('TM')).toBeTruthy()
      const pos = within(bar).getByText('Question 1 of 2')
      expect(Object.assign({}, ...[pos.props.style].flat(Infinity).filter(Boolean)).fontVariant).toEqual(['tabular-nums'])
      fireEvent.press(within(bar).getByRole('button', { name: 'Report this question' }))
      expect(await screen.findByText('Wrong answer')).toBeTruthy()
    })

    it('has Previous (icon) · Questions · the primary on the glass bottom bar', async () => {
      await startExam()
      const bar = screen.getByTestId('runner-bottom-bar')
      const prev = within(bar).getByRole('button', { name: 'Previous question' })
      expect(aria(prev, 'aria-disabled')).toBe(true) // the first question
      fireEvent.press(within(bar).getByRole('button', { name: 'All questions' }))
      expect(await screen.findByText('Review your answers')).toBeTruthy()
    })

    it('choices are radios: checked state, the question in title3, the pick announced', async () => {
      await startExam()
      const stem = screen.getByText('2+2?')
      expect(Object.assign({}, ...[stem.props.style].flat(Infinity).filter(Boolean)).fontSize).toBe(20)
      expect(screen.getAllByRole('radio')).toHaveLength(4)
      expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0)
      fireEvent.press(screen.getByRole('radio', { name: '4' }))
      expect(screen.getByRole('radio', { name: '4', checked: true })).toBeTruthy()
      expect(screen.getAllByRole('radio', { checked: false })).toHaveLength(3)
    })

    it('results: neutral ring, "N of M", the Correct/Wrong/Skipped strip, kind wrong-answer copy, no verdicts', async () => {
      await startExam()
      fireEvent.press(screen.getByRole('radio', { name: '1' })) // wrong on 2+2
      fireEvent.press(screen.getByRole('button', { name: 'All questions' }))
      await submitFromSheet()
      const ring = screen.getByLabelText('Score: 0%, 0 of 1 correct')
      expect(ring.props.role).toBe('img')
      expect(screen.getByText('0 of 1')).toBeTruthy() // the unreached question is not counted
      expect(screen.getByLabelText('Correct: 0')).toBeTruthy()
      expect(screen.getByLabelText('Wrong: 1')).toBeTruthy()
      expect(screen.getByLabelText('Skipped: 0')).toBeTruthy()
      // The card is the same neutral white at 0% as at any score.
      const card = screen.getByTestId('results-score-card')
      expect(Object.assign({}, ...[card.props.style].flat(Infinity).filter(Boolean)).backgroundColor).toBe('#ffffff')
      const tree = JSON.stringify(screen.toJSON()).toLowerCase()
      for (const banned of ['below cut-off', 'percentile', 'passed', 'failed', 'top tier', 'foundational', 'tapos na', 'hakbang']) {
        expect(tree).not.toContain(banned)
      }
      // Kind wrong-answer copy in the review.
      fireEvent.press(screen.getByText('Review 1 answer'))
      expect(screen.getByText('Not quite. The answer is D. Here’s why…')).toBeTruthy()
      expect(screen.getAllByText('Your answer').length).toBeGreaterThan(0)
    })
  })
})
