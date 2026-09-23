// UP Office of Admissions compliance guard: the estimator must never claim to
// know a student's official UPG, promise qualification, or use pass/fail
// language — only "Estimated Admission Score ... based on historical
// cutoffs". This renders every screen/state and scans all text nodes.
import React from 'react'
import { render, act } from '@testing-library/react-native'
import EstimatorScreen from '../index'
import EstimatorGradesScreen from '../grades'
import { ScoreDisclaimerModal } from '../../../components/estimator/ScoreDisclaimerModal'
import { useAdmissionEstimate } from '../../../hooks/useAdmissionEstimate'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../hooks/useAdmissionEstimate')
const mockUseAdmissionEstimate = useAdmissionEstimate as jest.Mock

jest.mock('../../../hooks/useDb', () => {
  const db = { select: () => ({ from: () => Promise.resolve([]) }) }
  return { useDb: () => db }
})
jest.mock('../../../services/settings', () => ({
  getSettings: () => Promise.resolve({}),
  updateSettings: () => Promise.resolve(),
}))

const READY_RESULT = {
  point: 2.352,
  low: 2.152,
  high: 2.552,
  eeas: { palugit: 0.05, pabigat: 0.05, eligiblePalugit: true },
  campuses: [
    { campus: 'UP Diliman', program: 'BS Computer Science', cutoff: 1.55, year: 2025, isEstimate: false, status: 'Unlikely', gap: 0.8 },
    { campus: 'UP Diliman', program: null, cutoff: 2.174, year: 2019, isEstimate: true, status: 'Possible', gap: 0.178 },
    { campus: 'UP Baguio', program: null, cutoff: 2.6, year: 2019, isEstimate: true, status: 'Likely', gap: -0.25 },
  ],
}

const READY_READINESS = {
  math: { percent: 65, answered: 30, needed: 0 },
  reading: { percent: 70, answered: 25, needed: 0 },
  language: { percent: 72, answered: 22, needed: 0 },
  science: { percent: 60, answered: 20, needed: 0 },
  ready: true,
}

const NOT_READY_READINESS = {
  math: { percent: null, answered: 5, needed: 15 },
  reading: { percent: null, answered: 0, needed: 20 },
  language: { percent: 80, answered: 20, needed: 0 },
  science: { percent: null, answered: 12, needed: 8 },
  ready: false,
}

// ── Banned phrases (case-insensitive). Each may legitimately appear ONLY
// inside one of the ALLOWED_CONTEXTS substrings below (e.g. the disclaimer's
// "NOT ... a guarantee of admission" / "Hindi garantiya ng pagpasa").
const BANNED_PATTERNS: RegExp[] = [
  /your upg/i,
  /upg is/i,
  /will qualify/i,
  /\bpass(ed)?\b/i,
  /\bfail(ed)?\b/i,
  /guarantee/i,
]

// Exact phrases where a banned pattern is allowed to match because the
// surrounding sentence is a negation (the disclaimer explicitly disclaiming
// the very thing the pattern flags).
const ALLOWED_CONTEXTS = [
  'This estimate is not a guarantee of admission.',
  'Hindi garantiya ng pagpasa ang estima na ito.',
]

function stripAllowedContexts(text: string): string {
  let out = text
  for (const allowed of ALLOWED_CONTEXTS) out = out.split(allowed).join(' ')
  return out
}

/** Recursively collects every string child from a react-test-renderer JSON tree. */
function collectText(node: any, out: string[] = []): string[] {
  if (node == null) return out
  if (typeof node === 'string') { out.push(node); return out }
  if (Array.isArray(node)) { for (const c of node) collectText(c, out); return out }
  if (node.children) for (const c of node.children) collectText(c, out)
  return out
}

function assertCompliant(renderResult: ReturnType<typeof render>, label: string) {
  const allText = collectText(renderResult.toJSON()).join(' \n ')
  const scrubbed = stripAllowedContexts(allText)
  for (const pattern of BANNED_PATTERNS) {
    expect(scrubbed).not.toMatch(pattern)
  }
  return allText
}

function mockState(overrides: Partial<ReturnType<typeof useAdmissionEstimate>>) {
  mockUseAdmissionEstimate.mockReturnValue({
    status: 'loading',
    readiness: null,
    result: null,
    acknowledgeDisclaimer: jest.fn(),
    reload: jest.fn(),
    ...overrides,
  })
}

describe('Estimator compliance', () => {
  beforeEach(() => jest.clearAllMocks())

  it('the disclaimer modal contains no banned claims outside its own negations', () => {
    const r = render(<ScoreDisclaimerModal visible onAcknowledge={() => {}} />)
    assertCompliant(r, 'disclaimer modal')
  })

  it('the no-grades state is compliant', () => {
    mockState({ status: 'no-grades' })
    const r = render(<EstimatorScreen />)
    assertCompliant(r, 'no-grades')
  })

  it('the not-ready (practice to unlock) state is compliant', () => {
    mockState({ status: 'not-ready', readiness: NOT_READY_READINESS as any })
    const r = render(<EstimatorScreen />)
    assertCompliant(r, 'not-ready')
  })

  it('the ready (full results) state is compliant and states the required phrases', () => {
    mockState({ status: 'ready', readiness: READY_READINESS as any, result: READY_RESULT as any })
    const r = render(<EstimatorScreen />)
    const allText = assertCompliant(r, 'ready')
    expect(allText).toMatch(/Estimated Admission Score/)
    expect(allText).toMatch(/based on historical cutoffs/)
  })

  it('the grades entry screen is compliant', async () => {
    const r = render(<EstimatorGradesScreen />)
    await act(async () => {}) // flush the screen's async settings load
    assertCompliant(r, 'grades')
  })
})
