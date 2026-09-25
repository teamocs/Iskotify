import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import { Alert } from 'react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockSearchParams: { slug?: string } = {}
const mockRouterBack = jest.fn()

jest.mock('expo-router', () => ({
  router: { push: () => {}, replace: () => {}, back: (...a: unknown[]) => mockRouterBack(...a) },
  useLocalSearchParams: () => mockSearchParams,
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}))

jest.mock('../../../../components/upcat/QuestionNavigator', () => ({
  QuestionNavigator: ({ total, currentIdx }: { total: number; currentIdx: number }) => {
    const { Text } = require('react-native')
    return <Text testID="qnav">{`Q${currentIdx + 1}/${total}`}</Text>
  },
}))

jest.mock('../../../../services/questionReports', () => ({
  submitQuestionReport: jest.fn().mockResolvedValue(undefined),
}))

// A single stable `db` object — loadExam's effect depends on [db, slug], so a
// fresh literal per useDb() call would refire the load on every re-render.
jest.mock('../../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})

const mockRecordSession = jest.fn(() => Promise.resolve())
jest.mock('../../../../hooks/useRecordSession', () => ({
  useRecordSession: () => ({ recordSession: mockRecordSession }),
}))

const mockRecordAttempts = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useRecordAttempts', () => ({
  useRecordAttempts: () => ({ recordAttempts: mockRecordAttempts }),
}))

// Post-session Estimated Admission Score delta (Task 5) — only wired for the
// 'upcat' blueprint slug. Mocked the same way as subtest.test.tsx so this file
// doesn't need to simulate the settings/attempts/cutoffs query chain.
const mockLoadSnapshot = jest.fn()
jest.mock('../../../../hooks/useAdmissionEstimate', () => ({
  loadAdmissionEstimateSnapshot: (...args: unknown[]) => mockLoadSnapshot(...args),
}))

const mockGetExamBlueprint = jest.fn()
const mockGetQuestionsByCategory = jest.fn()
const mockGetAllPassages = jest.fn()
const mockGetTargetCourseClusters = jest.fn()
jest.mock('../../../../services/examBlueprints', () => ({
  getExamBlueprint: (...a: unknown[]) => mockGetExamBlueprint(...a),
  getQuestionsByCategory: (...a: unknown[]) => mockGetQuestionsByCategory(...a),
  getAllPassages: (...a: unknown[]) => mockGetAllPassages(...a),
  getTargetCourseClusters: (...a: unknown[]) => mockGetTargetCourseClusters(...a),
}))

// Fix 1 — leave-confirmation + resume persistence. Both are exercised for
// real (behaviorally) in their own unit tests (hooks/__tests__/usePreventLeave.test.ts,
// services/__tests__/examRuns.test.ts, utils/__tests__/examRunPersistence.test.ts);
// here we only need to observe how the screen calls them.
const mockUsePreventLeave = jest.fn()
jest.mock('../../../../hooks/usePreventLeave', () => ({
  usePreventLeave: (...a: unknown[]) => mockUsePreventLeave(...a),
}))

const mockSaveRun = jest.fn().mockResolvedValue(undefined)
const mockLoadRun = jest.fn().mockResolvedValue(null)
const mockClearRun = jest.fn().mockResolvedValue(undefined)
jest.mock('../../../../hooks/useExamRunPersistence', () => ({
  useExamRunPersistence: () => ({ saveRun: mockSaveRun, loadRun: mockLoadRun, clearRun: mockClearRun }),
}))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

/** Fix 2: the last question opens a review sheet instead of submitting
 *  directly — drives that flow through to an actual submit() call, the same
 *  way a student who taps through the confirmation would. */
async function reviewAndConfirmSubmit(alertSpy: jest.SpyInstance) {
  fireEvent.press(screen.getByText('Review & submit'))
  fireEvent.press(await screen.findByRole('button', { name: /submit exam/i }))
  const call = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]!
  const buttons = call[2] as { text: string; onPress?: () => void }[]
  await act(async () => {
    buttons.find(b => b.text.toLowerCase() === 'submit')!.onPress!()
  })
}

describe('BlueprintExam', () => {
  let randomSpy: jest.SpyInstance
  let alertSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockRouterBack.mockClear()
    mockUsePreventLeave.mockClear()
    mockSaveRun.mockClear()
    mockLoadRun.mockClear().mockResolvedValue(null)
    mockClearRun.mockClear()
    mockSearchParams = { slug: 'test-mock' }

    mockGetExamBlueprint.mockResolvedValue(BLUEPRINT)
    mockGetQuestionsByCategory.mockResolvedValue(new Map([['quant', [Q1, Q2]]]))
    mockGetAllPassages.mockResolvedValue([])
    mockGetTargetCourseClusters.mockResolvedValue([])
    mockLoadSnapshot.mockReset()
    mockLoadSnapshot.mockResolvedValue({ status: 'not-ready', readiness: null, result: null })
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})

    // buildBlueprintExam shuffles its section pool (utils/examBuilder.ts). Pin
    // Math.random so the 2-item pool always reverses to [Q2, Q1] — makes the
    // resulting flat question order deterministic for these assertions.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    randomSpy.mockRestore()
    alertSpy.mockRestore()
  })

  it('writes a question_attempts row per question, tagged with the section name as subtest, on submit (Task D)', async () => {
    render(<BlueprintExam />)

    // Prestart screen loads first.
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))

    // Deterministic shuffle -> flat order is [Q2, Q1].
    await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
    fireEvent.press(screen.getByText('4')) // Q2 correct (index 3)
    fireEvent.press(screen.getByText('Next'))

    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2')) // Q1 correct (index 1)

    await reviewAndConfirmSubmit(alertSpy)

    expect(mockRecordAttempts).toHaveBeenCalledTimes(1)
    const rows = mockRecordAttempts.mock.calls[0]![0] as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      sourceTable: 'upcat_questions', listingSlug: 'test-mock', questionId: 'Q2',
      subtest: 'Math', topic: 'Geometry', selectedIndex: 3, correctIndex: 3, correct: true,
    })
    expect(rows[1]).toMatchObject({
      sourceTable: 'upcat_questions', listingSlug: 'test-mock', questionId: 'Q1',
      subtest: 'Math', topic: 'Arithmetic', selectedIndex: 1, correctIndex: 1, correct: true,
    })
    expect(typeof rows[0].sessionKey).toBe('number')
    expect(rows[0].sessionKey).toBe(rows[1].sessionKey) // one run = one sessionKey

    expect(mockRecordSession).toHaveBeenCalledWith(
      expect.objectContaining({ listingSlug: 'test-mock', subtest: 'Math', score: 2, total: 2 }),
    )
  })

  it('finding #2: a rejected recordAttempts insert still reaches the results screen (telemetry is best-effort)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockRecordAttempts.mockRejectedValueOnce(new Error('disk full'))

    render(<BlueprintExam />)
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))

    await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))

    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    await reviewAndConfirmSubmit(alertSpy)

    // Reached results despite the telemetry insert rejecting — not stranded
    // behind the double-submit guard.
    expect(screen.getByText('Per-section')).toBeTruthy()
    expect(warnSpy).toHaveBeenCalledWith('[exam/[slug]] recordAttempts failed:', expect.any(Error))

    warnSpy.mockRestore()
  })

  it('shows the Estimated Admission Score delta after finishing the "upcat" blueprint mock when already ready before', async () => {
    mockSearchParams = { slug: 'upcat' }
    mockGetExamBlueprint.mockResolvedValue({ ...BLUEPRINT, slug: 'upcat' })
    mockLoadSnapshot
      .mockResolvedValueOnce({ status: 'ready', readiness: null, result: { point: 2.40, low: 2.20, high: 2.60 } }) // before
      .mockResolvedValueOnce({ status: 'ready', readiness: null, result: { point: 2.33, low: 2.13, high: 2.53 } }) // after

    render(<BlueprintExam />)
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))

    await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))

    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    await reviewAndConfirmSubmit(alertSpy)

    expect(await screen.findByText('Estimated Admission Score 2.40 → 2.33, lower is better')).toBeTruthy()
  })

  it('does not compute a delta for non-upcat blueprints', async () => {
    // slug stays 'test-mock' (default) — loadAdmissionEstimateSnapshot must not be called.
    render(<BlueprintExam />)
    await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
    fireEvent.press(screen.getByText('Full Mock'))

    await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
    fireEvent.press(screen.getByText('4'))
    fireEvent.press(screen.getByText('Next'))

    await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    fireEvent.press(screen.getByText('2'))

    await reviewAndConfirmSubmit(alertSpy)

    expect(mockLoadSnapshot).not.toHaveBeenCalled()
    expect(screen.queryByText(/Estimated Admission Score/)).toBeNull()
  })

  // ── Fix 2: last-question safety ────────────────────────────────────────────
  describe('Fix 2: the last question never submits directly', () => {
    it('opens a review sheet instead of calling submit() when the last question is reached', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))

      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())

      // There is no button labelled "Submit" left bare on the last question.
      expect(screen.queryByText('Submit')).toBeNull()
      fireEvent.press(screen.getByText('Review & submit'))

      expect(mockRecordAttempts).not.toHaveBeenCalled()
      expect(await screen.findByRole('button', { name: /submit exam/i })).toBeTruthy()
    })

    it('does not submit if the review sheet is dismissed via "Back to exam"', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('2'))

      fireEvent.press(screen.getByText('Review & submit'))
      fireEvent.press(await screen.findByRole('button', { name: /back to exam/i }))

      expect(mockRecordAttempts).not.toHaveBeenCalled()
      // Still on the exam screen, not results.
      expect(screen.getByText('1+1?')).toBeTruthy()
    })
  })

  // ── Fix 3: neutral results ──────────────────────────────────────────────────
  describe('Fix 3: results are neutral, no pass/fail or percentile', () => {
    async function reachResults() {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('1')) // wrong (correct is index 3)
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('1')) // wrong (correct is index 1)
      await reviewAndConfirmSubmit(alertSpy)
    }

    it('never renders pass/fail verdict copy or a percentile', async () => {
      await reachResults()
      const tree = JSON.stringify(screen.toJSON()).toLowerCase()
      expect(tree).not.toContain('great work')
      expect(tree).not.toContain('keep practicing')
      expect(tree).not.toContain('below cut-off')
      expect(tree).not.toContain('percentile')
      expect(tree).not.toMatch(/\d+th\)/) // the old "est. ~62th" ordinal bug
    })

    it('makes "Review mistakes" the primary action and "Retake exam" secondary', async () => {
      await reachResults()
      expect(screen.getByText('Review mistakes')).toBeTruthy()
      expect(screen.getByText('Retake exam')).toBeTruthy()
    })
  })

  // ── Fix 1: leave-confirmation + persistence ────────────────────────────────
  describe('Fix 1: leave-confirmation and in-progress persistence', () => {
    it('guards leaving while an exam is in progress, and lets router.back() through once confirmed', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())

      expect(mockUsePreventLeave).toHaveBeenLastCalledWith(true, expect.any(Function))
      const onAttemptLeave = mockUsePreventLeave.mock.calls[mockUsePreventLeave.mock.calls.length - 1]![1] as () => void

      act(() => onAttemptLeave())
      expect(alertSpy).toHaveBeenCalledWith(
        'Leave the exam?',
        'Your progress is saved.',
        expect.any(Array),
      )
      const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]![2] as { text: string; onPress?: () => void }[]
      expect(mockRouterBack).not.toHaveBeenCalled()
      await act(async () => { buttons.find(b => b.text === 'Leave')!.onPress!() })
      await waitFor(() => expect(mockRouterBack).toHaveBeenCalled())
    })

    it('stops guarding once results are shown', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('2'))
      await reviewAndConfirmSubmit(alertSpy)

      expect(mockUsePreventLeave).toHaveBeenLastCalledWith(false, expect.any(Function))
    })

    it('persists answers/position to local storage as the student answers questions', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('4'))

      await waitFor(() => expect(mockSaveRun).toHaveBeenCalled())
      const lastCall = mockSaveRun.mock.calls[mockSaveRun.mock.calls.length - 1]![0]
      expect(lastCall).toMatchObject({
        runKey: 'exam:test-mock',
        kind: 'exam',
        slug: 'test-mock',
        answers: { 0: 3 },
        questionIds: ['Q2', 'Q1'],
        sectionNames: ['Math', 'Math'],
      })
    })

    it('clears the saved run on submit', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      fireEvent.press(screen.getByText('Full Mock'))
      await waitFor(() => expect(screen.getByText('2+2?')).toBeTruthy())
      fireEvent.press(screen.getByText('4'))
      fireEvent.press(screen.getByText('Next'))
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
      fireEvent.press(screen.getByText('2'))
      await reviewAndConfirmSubmit(alertSpy)

      expect(mockClearRun).toHaveBeenCalledWith('exam:test-mock')
    })

    it('offers "Resume where you left off" on the prestart screen when a saved run exists', async () => {
      mockLoadRun.mockResolvedValue({
        runKey: 'exam:test-mock', kind: 'exam', slug: 'test-mock', mode: 'full',
        questionIds: ['Q2', 'Q1'], sectionNames: ['Math', 'Math'],
        answers: { 0: 3 }, idx: 1, sectionIdx: 0, floorIdx: 0,
        endTime: Date.now() + 60_000, sectionEndTime: null, startedAt: Date.now(), updatedAt: Date.now(),
      })

      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Resume where you left off')).toBeTruthy())

      fireEvent.press(screen.getByText('Resume where you left off'))

      // Resumed straight into the saved position (idx 1 -> "1+1?") with the
      // saved answer for question 0 already applied.
      await waitFor(() => expect(screen.getByText('1+1?')).toBeTruthy())
    })

    it('does not offer Resume when no saved run exists', async () => {
      render(<BlueprintExam />)
      await waitFor(() => expect(screen.getByText('Full Mock')).toBeTruthy())
      expect(screen.queryByText('Resume where you left off')).toBeNull()
    })
  })
})
