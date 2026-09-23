import React from 'react'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native'
import BlueprintExam from '../[slug]'
import type { ExamBlueprint } from '../../../../services/examBlueprints'
import type { RawUpcatQuestion } from '../../../../utils/upcatExam'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockSearchParams: { slug?: string } = {}

jest.mock('expo-router', () => ({
  router: { push: () => {}, replace: () => {}, back: () => {} },
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

describe('BlueprintExam', () => {
  let randomSpy: jest.SpyInstance

  beforeEach(() => {
    jest.useRealTimers()
    mockRecordSession.mockClear()
    mockRecordAttempts.mockClear()
    mockSearchParams = { slug: 'test-mock' }

    mockGetExamBlueprint.mockResolvedValue(BLUEPRINT)
    mockGetQuestionsByCategory.mockResolvedValue(new Map([['quant', [Q1, Q2]]]))
    mockGetAllPassages.mockResolvedValue([])
    mockGetTargetCourseClusters.mockResolvedValue([])
    mockLoadSnapshot.mockReset()
    mockLoadSnapshot.mockResolvedValue({ status: 'not-ready', readiness: null, result: null })

    // buildBlueprintExam shuffles its section pool (utils/examBuilder.ts). Pin
    // Math.random so the 2-item pool always reverses to [Q2, Q1] — makes the
    // resulting flat question order deterministic for these assertions.
    randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    randomSpy.mockRestore()
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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

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

    await act(async () => {
      fireEvent.press(screen.getByText('Submit'))
    })

    expect(mockLoadSnapshot).not.toHaveBeenCalled()
    expect(screen.queryByText(/Estimated Admission Score/)).toBeNull()
  })
})
