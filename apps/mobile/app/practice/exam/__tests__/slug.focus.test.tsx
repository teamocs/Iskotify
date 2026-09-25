import React from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'

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
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
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
    it('opens with a calm Taglish close and shows the per-subtest breakdown', async () => {
      await startExam()
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('2'))
      fireEvent.press(screen.getByText('Review & submit'))
      fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      await act(async () => { buttons.find(b => b.text === 'Submit')!.onPress!() })

      expect(await screen.findByRole('header', { name: 'Tapos na! Mock complete.' })).toBeTruthy()
      expect(screen.getByRole('progressbar', { name: 'Math score' })).toBeTruthy()
      expect(screen.getByText('2/2 correct · 100%')).toBeTruthy()
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
      await screen.findByRole('header', { name: 'Tapos na! Mock complete.' })

      const header = () => screen.UNSAFE_getAllByProps({ accessibilityLabel: 'Math, 1 to review' })
        .find(n => typeof n.type !== 'string')!
      expect(header().props['aria-expanded']).toBe(false)
      expect(screen.getByRole('button', { name: 'Math, 1 to review', expanded: false })).toBeTruthy()

      fireEvent.press(screen.getByRole('button', { name: 'Math, 1 to review' }))
      expect(header().props['aria-expanded']).toBe(true)
      expect(screen.getByRole('button', { name: 'Math, 1 to review', expanded: true })).toBeTruthy()
    })
  })
})
