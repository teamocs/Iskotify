/**
 * Onboarding (redesign M2): one question per step, a "Step n of 9" progress
 * indicator, large selectable rows with aria state, and resume-safe — every
 * answer is saved when the student continues, and a relaunch picks up at the
 * first unanswered required question.
 */
import React from 'react'
import { BackHandler } from 'react-native'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native'
import OnboardingScreen from '../onboarding'
import { userSettings } from '../../db/schema'
import { aria } from '../../test-utils/aria'

jest.mock('../../components/SchoolPicker', () => ({
  SchoolPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const { TextInput } = require('react-native')
    return <TextInput testID="school-picker-mock" value={value} onChangeText={onChange} />
  },
}))

jest.mock('../../components/practice/QuestionFigure', () => ({ QuestionFigure: () => null }))

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

function makeBuilder(data: Record<string, unknown>[] = []) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'gt', 'neq', 'order', 'limit', 'update', 'upsert']) {
    builder[m] = jest.fn(() => builder)
  }
  builder.single = jest.fn().mockResolvedValue({ data: null, error: null })
  ;(builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null })
  return builder
}

jest.mock('../../services/supabase', () => ({
  supabase: {
    from: jest.fn(() => {
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gt', 'neq', 'order', 'limit', 'update', 'upsert']) b[m] = jest.fn(() => b)
      ;(b as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      return b
    }),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null } }) },
  },
}))

let mockSyncImpl: () => Promise<void> = () => Promise.resolve()
jest.mock('../../services/sync', () => ({
  syncOnLaunch: jest.fn(() => mockSyncImpl()),
  pushUserData: jest.fn().mockResolvedValue(undefined),
}))

const mockFlushWeb = jest.fn()
jest.mock('../../db/webPersist', () => ({
  flushWebPersist: () => mockFlushWeb(),
  scheduleWebPersist: jest.fn(),
}))

let mockBackHandler: (() => boolean) | null = null

jest.mock('../../hooks/useAiEnhancement', () => ({
  runEnhancement: jest.fn().mockResolvedValue(undefined),
}))

// DB: `select` resolves the saved settings row (resume source); inserts are recorded.
let mockSavedSettings: Record<string, unknown>[] = []
let mockFocusRows: Record<string, unknown>[] = []
const mockInserts: { table: unknown; values: Record<string, unknown> }[] = []
jest.mock('../../hooks/useDb', () => {
  const { userSettings, focusListings } = jest.requireActual('../../db/schema')
  const db = {
    select: jest.fn(() => ({
      from: jest.fn((table: unknown) => {
        const rows = () => (table === userSettings ? mockSavedSettings : table === focusListings ? mockFocusRows : [])
        const chain: Record<string, unknown> = {}
        chain.where = jest.fn(() => chain)
        chain.orderBy = jest.fn(() => chain)
        chain.limit = jest.fn(() => Promise.resolve(rows()))
        // Awaited without .limit(): settings / focus rows as saved; anything else
        // (the question-bank read) → nothing synced yet.
        ;(chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(rows())
        return chain
      }),
    })),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn((values: Record<string, unknown>) => {
        mockInserts.push({ table, values })
        const done = Promise.resolve()
        return {
          onConflictDoUpdate: jest.fn(() => done),
          onConflictDoNothing: jest.fn(() => done),
          run: jest.fn(),
        }
      }),
    })),
    delete: jest.fn(() => ({ where: jest.fn(() => Promise.resolve()) })),
    transaction: jest.fn((cb: (tx: unknown) => void) => cb({
      insert: jest.fn(() => ({ values: jest.fn(() => ({ run: jest.fn() })) })),
    })),
  }
  return { useDb: () => db }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockSavedSettings = []
  mockFocusRows = []
  mockInserts.length = 0
  mockSyncImpl = () => Promise.resolve()
  mockBackHandler = null
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, h) => {
    mockBackHandler = h as () => boolean
    return { remove: jest.fn() }
  })
  const { supabase } = require('../../services/supabase')
  supabase.from.mockImplementation(() => makeBuilder([]))
})

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve() })
}

async function renderFresh() {
  render(<OnboardingScreen />)
  await flush()
}

function pressContinue() {
  fireEvent.press(screen.getByRole('button', { name: /^Continue/ }))
}

async function answerNameAndGrade(name = 'Juan dela Cruz', grade = 'Grade 11') {
  fireEvent.changeText(screen.getByLabelText('Full name'), name)
  pressContinue()
  await flush()
  fireEvent.press(screen.getByRole('radio', { name: grade }))
  pressContinue()
  await flush()
}

describe('Onboarding: one question per step', () => {
  it('opens on the name question with the step indicator', async () => {
    await renderFresh()
    expect(screen.getByRole('header', { name: 'What should we call you?' })).toBeTruthy()
    expect(screen.getByText('Step 1 of 9')).toBeTruthy()
    expect(screen.getByRole('progressbar')).toBeTruthy()
    // Only the name field on this step: no grade picker, no school picker.
    expect(screen.queryByRole('radio', { name: 'Grade 11' })).toBeNull()
    expect(screen.queryByTestId('school-picker-mock')).toBeNull()
  })

  it('keeps Continue disabled (aria-disabled) until a name is typed', async () => {
    await renderFresh()
    const cont = screen.getByRole('button', { name: /^Continue/ })
    expect(aria(cont, 'aria-disabled')).toBe(true)
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Juan')
    expect(aria(screen.getByRole('button', { name: /^Continue/ }), 'aria-disabled')).toBe(false)
  })

  it('the name field autocompletes as a name', async () => {
    await renderFresh()
    const field = screen.getByLabelText('Full name')
    expect(field.props.autoComplete).toBe('name')
    expect(field.props.textContentType).toBe('name')
  })

  it('asks the grade next, as large radio rows that expose aria-checked', async () => {
    await renderFresh()
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Juan')
    pressContinue()
    await flush()
    expect(screen.getByRole('header', { name: 'What grade are you in?' })).toBeTruthy()
    expect(screen.getByText('Step 2 of 9')).toBeTruthy()
    const g11 = screen.getByRole('radio', { name: 'Grade 11' })
    expect(aria(g11, 'aria-checked')).toBe(false)
    fireEvent.press(g11)
    expect(aria(screen.getByRole('radio', { name: 'Grade 11' }), 'aria-checked')).toBe(true)
    expect(aria(screen.getByRole('radio', { name: 'Grade 12' }), 'aria-checked')).toBe(false)
  })

  it('saves the name and grade as soon as each is answered', async () => {
    await renderFresh()
    await answerNameAndGrade('Maria Santos', 'Grade 12')
    const saved = mockInserts.filter(i => i.table === userSettings).map(i => i.values)
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ fullName: 'Maria Santos' }),
      expect.objectContaining({ gradeLevel: 12 }),
    ]))
  })

  it('then asks for the school (optional, with Skip)', async () => {
    await renderFresh()
    await answerNameAndGrade()
    expect(screen.getByRole('header', { name: 'Where do you study?' })).toBeTruthy()
    expect(screen.getByTestId('school-picker-mock')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Skip this question' }))
    await flush()
    expect(screen.getByRole('header', { name: 'What are you preparing for?' })).toBeTruthy()
  })

  it('Back returns to the previous question with the answer kept', async () => {
    await renderFresh()
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Juan')
    pressContinue()
    await flush()
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('header', { name: 'What should we call you?' })).toBeTruthy()
    expect(screen.getByLabelText('Full name').props.value).toBe('Juan')
  })

  it('has no Back button on the first question', async () => {
    await renderFresh()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })
})

describe('Onboarding: Android Back', () => {
  it('steps back one question instead of leaving onboarding', async () => {
    await renderFresh()
    fireEvent.changeText(screen.getByLabelText('Full name'), 'Juan')
    pressContinue()
    await flush()
    expect(screen.getByRole('header', { name: 'What grade are you in?' })).toBeTruthy()
    let handled = false
    act(() => { handled = mockBackHandler!() })
    expect(handled).toBe(true)
    expect(screen.getByRole('header', { name: 'What should we call you?' })).toBeTruthy()
    // The typed name is kept.
    expect(screen.getByLabelText('Full name').props.value).toBe('Juan')
  })

  it('on the first question it lets the system handle Back', async () => {
    await renderFresh()
    expect(mockBackHandler!()).toBe(false)
  })
})

describe('Onboarding: web persistence', () => {
  // The web build keeps SQLite in memory (sql.js) and only writes IndexedDB on
  // a 2s debounce or an async pagehide save, which a reload beats. Each answer
  // is flushed right away so a reload resumes where the student stopped.
  it('flushes every saved answer to durable storage straight away', async () => {
    await renderFresh()
    await answerNameAndGrade()
    expect(mockFlushWeb.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})

describe('Onboarding: resume-safe', () => {
  it('resumes at the goal question when name and grade were saved before', async () => {
    mockSavedSettings = [{ id: 1, fullName: 'Juan', gradeLevel: 11, school: '', schoolRegion: '' }]
    await renderFresh()
    await waitFor(() => expect(screen.getByRole('header', { name: 'What are you preparing for?' })).toBeTruthy())
    expect(screen.getByText('Step 4 of 9')).toBeTruthy()
  })

  it('resumes at the grade when only the name is saved (e.g. from Google sign-in)', async () => {
    mockSavedSettings = [{ id: 1, fullName: 'Juan', gradeLevel: null }]
    await renderFresh()
    await waitFor(() => expect(screen.getByRole('header', { name: 'What grade are you in?' })).toBeTruthy())
  })

  it('records the furthest step reached, including a skipped optional one', async () => {
    await renderFresh()
    await answerNameAndGrade()
    fireEvent.press(screen.getByRole('button', { name: 'Skip this question' }))
    await flush()
    const steps = mockInserts.filter(i => i.table === userSettings).map(i => i.values.onboardingStep)
    expect(steps).toEqual(['name', 'grade', 'school'])
  })

  it('going Back never moves the saved progress marker backwards', async () => {
    mockSavedSettings = [{ id: 1, fullName: 'Juan', gradeLevel: 11, onboardingStep: 'school' }]
    await renderFresh()
    await waitFor(() => screen.getByRole('header', { name: 'What are you preparing for?' }))
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    pressContinue()
    await flush()
    const last = mockInserts.filter(i => i.table === userSettings).at(-1)!.values
    expect(last.onboardingStep).toBe('school')
  })

  it('resumes at the optional school question when the student stopped after the grade', async () => {
    mockSavedSettings = [{ id: 1, fullName: 'Juan', gradeLevel: 11, school: '', schoolRegion: '', onboardingStep: 'grade' }]
    await renderFresh()
    await waitFor(() => expect(screen.getByRole('header', { name: 'Where do you study?' })).toBeTruthy())
    expect(screen.getByText('Step 3 of 9')).toBeTruthy()
  })

  it('resumes after the goal at the courses, with the exams restored and recommendations shown', async () => {
    const { supabase } = require('../../services/supabase')
    supabase.from.mockImplementation((table: string) => {
      if (table === 'university_profiles') {
        return makeBuilder([{
          school_id: 'upd', data_tier: 'FULL_PROFILE', entrance_exam_acronym: 'UPCAT',
          entrance_exam_name: 'UP College Admission Test', exam_month: 'August',
          known_for_courses: ['Computer Science'], prc_top_courses: [],
        }])
      }
      if (table === 'tertiary_schools') {
        return makeBuilder([{
          id: 'upd', name: 'University of the Philippines Diliman', acronym: 'UP Diliman',
          region: 'NCR', province: 'Metro Manila', rank_in_province: 1,
        }])
      }
      if (table === 'course_taxonomy_map') {
        return makeBuilder([{ course_tab: 'bscs', career_course_id: null, label: 'BS Computer Science' }])
      }
      return makeBuilder([])
    })
    mockSavedSettings = [{
      id: 1, fullName: 'Juan', gradeLevel: 11, school: 'Pasig High', schoolRegion: 'NCR',
      selectedListingSlug: 'upcat',
      targetExams: JSON.stringify([{ schoolId: 'upd', schoolName: 'University of the Philippines Diliman', examAcronym: 'UPCAT' }]),
      targetCourses: '[]',
      onboardingStep: 'goals',
    }]
    mockFocusRows = [
      { listingSlug: 'upcat', priority: 1, addedAt: 1 },
      { listingSlug: 'dost-sei', priority: 2, addedAt: 1 },
    ]
    await renderFresh()
    await waitFor(() => screen.getByRole('header', { name: 'Which courses are you considering?' }))
    expect(await screen.findByRole('header', { name: 'Recommended for your exams' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'BS Computer Science' })).toBeTruthy()

    // Back on the goal: the exam and the scholarship are still picked.
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    await flush()
    const exam = await screen.findByRole('checkbox', { name: /University of the Philippines Diliman/ })
    expect(aria(exam, 'aria-checked')).toBe(true)
    expect(screen.getByRole('button', { name: 'Continue (2)' })).toBeTruthy()
  })

  it('restores the course, income, GWA and province answers', async () => {
    mockSavedSettings = [{
      id: 1, fullName: 'Juan', gradeLevel: 11, selectedListingSlug: 'upcat',
      targetExams: JSON.stringify([{ schoolId: 'upd', schoolName: 'UP Diliman', examAcronym: 'UPCAT' }]),
      targetCourses: JSON.stringify([{ id: 'tax:bscs', label: 'BS Computer Science', careerCourseId: null }]),
      incomeBracket: '100k-300k', gwa: 90.5, province: 'Albay',
      onboardingStep: 'province',
    }]
    mockFocusRows = [{ listingSlug: 'upcat', priority: 1, addedAt: 1 }]
    await renderFresh()
    await waitFor(() => expect(screen.getByText('Step 9 of 9')).toBeTruthy())

    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: 'Continue with Albay' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByLabelText('GWA').props.value).toBe('90.5')
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(aria(screen.getByRole('radio', { name: '₱100k to ₱300k' }), 'aria-checked')).toBe(true)
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    await flush()
    expect(aria(screen.getByRole('checkbox', { name: 'BS Computer Science' }), 'aria-checked')).toBe(true)
  })

  it('a finished onboarding is not re-entered: it goes straight to the app', async () => {
    const { router } = require('expo-router')
    mockSavedSettings = [{
      id: 1, fullName: 'Juan', gradeLevel: 11, selectedListingSlug: 'upcat', onboardingStep: 'done',
    }]
    mockFocusRows = [{ listingSlug: 'upcat', priority: 1, addedAt: 1 }]
    await renderFresh()
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'))
    expect(screen.queryByRole('header')).toBeNull()
  })
})

// ─── Goals → readiness gate ────────────────────────────────────────────────────

async function advanceToCheck({ syncImpl }: { syncImpl: () => Promise<void> }) {
  mockSyncImpl = syncImpl
  const { supabase } = require('../../services/supabase')
  supabase.from.mockImplementation((table: string) => {
    if (table === 'university_profiles') {
      return makeBuilder([{
        school_id: 'upd', data_tier: 'tier1', entrance_exam_acronym: 'UPCAT',
        entrance_exam_name: 'UP College Admission Test', exam_month: 'August',
        known_for_courses: [], prc_top_courses: [],
      }])
    }
    if (table === 'tertiary_schools') {
      return makeBuilder([{
        id: 'upd', name: 'University of the Philippines Diliman', acronym: 'UP Diliman',
        region: 'NCR', province: 'Metro Manila', rank_in_province: 1,
      }])
    }
    return makeBuilder([])
  })
  mockSavedSettings = [{ id: 1, fullName: 'Test', gradeLevel: 11, school: '', schoolRegion: '' }]
  render(<OnboardingScreen />)
  await flush()
  const exam = await screen.findByRole('checkbox', { name: /University of the Philippines Diliman/ })
  expect(aria(exam, 'aria-checked')).toBe(false)
  fireEvent.press(exam)
  expect(aria(screen.getByRole('checkbox', { name: /University of the Philippines Diliman/ }), 'aria-checked')).toBe(true)
  await act(async () => { pressContinue(); await Promise.resolve() })
  await flush()
  // courses, income, gwa, province: all optional
  for (const header of ['Which courses are you considering?', 'What is your household income?', 'What is your latest GWA?', 'Which province do you live in?']) {
    expect(screen.getByRole('header', { name: header })).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })); await Promise.resolve() })
    await flush()
  }
  expect(screen.getByText('Step 9 of 9')).toBeTruthy()
}

describe('Onboarding: goals and the readiness gate', () => {
  const { router } = require('expo-router')

  it('Continue on the goal stays disabled until an exam or scholarship is picked', async () => {
    mockSavedSettings = [{ id: 1, fullName: 'Juan', gradeLevel: 11 }]
    await renderFresh()
    await waitFor(() => screen.getByRole('header', { name: 'What are you preparing for?' }))
    expect(aria(screen.getByRole('button', { name: /^Continue/ }), 'aria-disabled')).toBe(true)
  })

  it('finishing while sync runs shows the gate (no emoji) and does not navigate', async () => {
    let resolveSync!: () => void
    const pending = new Promise<void>(res => { resolveSync = res })
    await advanceToCheck({ syncImpl: () => pending })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    expect(screen.getByText('Hang tight, almost there')).toBeTruthy()
    expect(screen.getByText(/We're preparing your reviewers/)).toBeTruthy()
    expect(router.replace).not.toHaveBeenCalled()
    await act(async () => { resolveSync() })
  })

  it('sync resolving while the gate is visible continues to the tour', async () => {
    let resolveSync!: () => void
    const pending = new Promise<void>(res => { resolveSync = res })
    await advanceToCheck({ syncImpl: () => pending })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    await act(async () => { resolveSync(); await Promise.resolve() })
    expect(router.replace).toHaveBeenCalledWith('/tour?from=onboarding')
  })

  it('sync error explains itself, and Try again / Continue anyway both work', async () => {
    let rejectSync!: (e: Error) => void
    const failing = new Promise<void>((_, rej) => { rejectSync = rej })
    await advanceToCheck({ syncImpl: () => failing })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    await act(async () => { rejectSync(new Error('network')); await Promise.resolve() })
    expect(screen.getByText("That didn't load")).toBeTruthy()
    expect(screen.getByText(/check your internet connection/i)).toBeTruthy()

    const { syncOnLaunch } = require('../../services/sync')
    const before = syncOnLaunch.mock.calls.length
    mockSyncImpl = () => new Promise<void>(() => {})
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Try again' })) })
    expect(syncOnLaunch.mock.calls.length).toBeGreaterThan(before)
  })

  it('Continue anyway from the error state still shows the tour first', async () => {
    let rejectSync!: (e: Error) => void
    const failing = new Promise<void>((_, rej) => { rejectSync = rej })
    await advanceToCheck({ syncImpl: () => failing })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    await act(async () => { rejectSync(new Error('network')); await Promise.resolve() })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: /Continue anyway/ })) })
    expect(router.replace).toHaveBeenCalledWith('/tour?from=onboarding')
  })

  it('the tour shows only once: a student who has seen it goes straight to Today', async () => {
    // Resumes on the last step (the quick check) with a tour already seen.
    mockSavedSettings = [{
      id: 1, fullName: 'Test', gradeLevel: 11, onboardingStep: 'province', tourSeenAt: 1_758_000_000_000,
      targetExams: '[{"schoolId":"upd","schoolName":"UP","examAcronym":"UPCAT"}]',
    }]
    await renderFresh()
    expect(screen.getByText('Step 9 of 9')).toBeTruthy()
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/(tabs)'))
    expect(router.replace).not.toHaveBeenCalledWith('/tour?from=onboarding')
  })

  it('finishing after sync already resolved goes straight to the tour', async () => {
    await advanceToCheck({ syncImpl: () => Promise.resolve() })
    await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Skip this question' })) })
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/tour?from=onboarding'))
    expect(screen.queryByText('Hang tight, almost there')).toBeNull()
    // Marked finished, so a relaunch never re-enters the flow.
    const steps = mockInserts.filter(i => i.table === userSettings).map(i => i.values.onboardingStep)
    expect(steps.at(-1)).toBe('done')
  })
})

describe('Onboarding: quick check results', () => {
  it('shows a neutral starting point, never a pass/fail verdict', async () => {
    await advanceToCheck({ syncImpl: () => Promise.resolve() })
    // Answer every question with the first option.
    for (let i = 0; i < 40; i++) {
      const options = screen.queryAllByRole('button', { name: /^Option A/ })
      if (options.length === 0) break
      fireEvent.press(options[0]!)
    }
    expect(screen.getByRole('header', { name: 'Your starting point' })).toBeTruthy()
    expect(screen.queryByText(/fail|pass|Assessment Complete/i)).toBeNull()
    expect(screen.getByRole('button', { name: /Start studying/ })).toBeTruthy()
  })
})
