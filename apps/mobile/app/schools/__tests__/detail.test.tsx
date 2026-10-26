import React from 'react'
import { Platform, Share } from 'react-native'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import SchoolProfileScreen from '../[slug]'
import { schoolSheetOptions } from '../../../components/schools/schoolSheet'
import { aria } from '../../../test-utils/aria'
import { countPrimaryActions } from '../../../test-utils/primaryActions'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismiss: jest.fn(),
    canGoBack: jest.fn(() => true), canDismiss: jest.fn(() => true),
  },
  useLocalSearchParams: jest.fn(() => ({ slug: 'up-diliman' })),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../components/ui/ScreenScroll', () => ({
  ScreenScroll: ({ children }: any) => children,
}))

// The requirements checklist persists ticks locally; keep it off the db mock.
const mockAcquired = jest.fn()
const mockToggle = jest.fn()
jest.mock('../../../services/coachQueue', () => ({
  getAcquiredRequirementIndices: (...a: unknown[]) => mockAcquired(...a),
  toggleRequirement: (...a: unknown[]) => mockToggle(...a),
}))

const mockFocus = { inFocus: false, addListing: jest.fn(), removeListing: jest.fn() }
jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    isInFocus: () => mockFocus.inFocus,
    getPriority: () => (mockFocus.inFocus ? 2 : null),
    addListing: mockFocus.addListing,
    removeListing: mockFocus.removeListing,
  }),
}))

jest.mock('../../../hooks/useDb', () => ({ useDb: jest.fn() }))

const mockRunnable = jest.fn()
jest.mock('../../../services/examBlueprints', () => ({
  listRunnableBlueprints: (...a: unknown[]) => mockRunnable(...a),
}))
const mockHasReview = jest.fn()
jest.mock('../../../services/practiceSignals', () => ({
  hasReviewContent: (...a: unknown[]) => mockHasReview(...a),
}))

const SCHOOL = {
  id: 'up-diliman', name: 'University of the Philippines Diliman', acronym: 'UPD',
  region: 'NCR', province: 'Metro Manila', city: 'Quezon City', type: 'State University', isSuc: true, isLuc: false,
}
const PROFILE = {
  schoolId: 'up-diliman', dataTier: null, institutionType: null, yearEstablished: '1949',
  knownForCourses: '["BS Physics"]', prcTopCourses: '[]', chedCoeCod: null, accreditation: 'AUN-QA',
  entranceExamName: 'UP College Admission Test', entranceExamAcronym: 'UPCAT', testingCenterType: null,
  applicationOpen: 'June', applicationClose: 'August', examMonth: 'October', estimatedPassingRate: null,
  estimatedSlots: null, tuitionFeeRange: null, freeTuition: true, academicCalendar: null,
  coursesOffered: '["BS Physics, BS Biology"]', scholarshipsOffered: '[]', requirements: '["Form 138"]', qualifications: '[]',
  websiteUrl: 'https://upd.edu.ph', applicationPortalUrl: null, facebookUrl: null, examDifficulty: 4,
  notablePrograms: '[]', prcStrongBoards: '[]', notes: null, dataConfidence: 'MEDIUM',
}

let failFirst = false
function makeDb(school: any, profile: any) {
  let call = 0
  return {
    select: jest.fn(() => {
      const idx = call++
      return {
        from: () => ({
          where: () => ({
            limit: () => {
              if (failFirst && idx === 0) return Promise.reject(new Error('offline'))
              return Promise.resolve(idx % 2 === 0 ? (school ? [school] : []) : (profile ? [profile] : []))
            },
          }),
        }),
      }
    }),
  }
}

const showSegment = (name: 'Overview' | 'Courses' | 'Admissions') =>
  fireEvent.press(screen.getByRole('radio', { name }))

describe('SchoolProfileScreen', () => {
  const realOS = Platform.OS
  beforeEach(() => {
    jest.clearAllMocks()
    failFirst = false
    mockFocus.inFocus = false
    mockRunnable.mockResolvedValue([])
    mockHasReview.mockResolvedValue(false)
    mockAcquired.mockResolvedValue([])
    mockToggle.mockResolvedValue(undefined)
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SCHOOL, PROFILE))
  })
  afterEach(() => { Platform.OS = realOS })

  // ── Presentation ────────────────────────────────────────────────────────────

  it('is a native formSheet resting at half height (detents 0.5 and 1), with a grabber and the 28pt corner', () => {
    expect(schoolSheetOptions('ios')).toEqual({
      presentation: 'formSheet',
      sheetAllowedDetents: [0.5, 1],
      sheetGrabberVisible: true,
      sheetCornerRadius: 28,
    })
    expect(schoolSheetOptions('android')).toMatchObject({ presentation: 'formSheet', sheetCornerRadius: 28 })
  })

  it('stays a plain push on web (no sheet options)', () => {
    expect(schoolSheetOptions('web')).toEqual({})
  })

  it('the root Stack presents schools/[slug] with the sheet options', () => {
    const fs = require('fs')
    const path = require('path')
    const src = fs.readFileSync(path.join(__dirname, '../../_layout.tsx'), 'utf8')
    expect(src).toMatch(/<Stack\.Screen name="schools\/\[slug\]" options=\{schoolSheetOptions\(\)\} \/>/)
  })

  it('native: shows a Close button and a skeleton first; Close dismisses the sheet', () => {
    const { router } = require('expo-router')
    render(<SchoolProfileScreen />)
    expect(screen.getByTestId('school-skeleton')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Close' }))
    expect(router.dismiss).toHaveBeenCalled()
  })

  it('web: the hero button is Back (a push), with the parent route after a deep link', () => {
    Platform.OS = 'web'
    const { router } = require('expo-router')
    router.canGoBack.mockReturnValueOnce(false)
    render(<SchoolProfileScreen />)
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(router.replace).toHaveBeenCalledWith('/explore?section=universities')
    expect(router.dismiss).not.toHaveBeenCalled()
  })

  it('says Iskotify is not affiliated with the school', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByRole('header', { name: 'University of the Philippines Diliman' })
    expect(screen.getByText('Iskotify isn’t affiliated with or endorsed by University of the Philippines Diliman.')).toBeTruthy()
  })

  it('titles the sheet with the school name as its header, over a maroon hero band and a 72pt logo tile', async () => {
    render(<SchoolProfileScreen />)
    expect(await screen.findByRole('header', { name: 'University of the Philippines Diliman' })).toBeTruthy()
    expect(screen.getByTestId('school-hero')).toBeTruthy()
    const tile = screen.getByTestId('logo-tile', { includeHiddenElements: true })
    const style = Object.assign({}, ...[tile.props.style].flat())
    expect(style.width).toBe(72)
  })

  it('shares the school name and its official site', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never)
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Share' }))
    expect(share).toHaveBeenCalledWith({ message: 'University of the Philippines Diliman\nOfficial site: https://upd.edu.ph' })
    share.mockRestore()
  })

  // ── Segmented control ───────────────────────────────────────────────────────

  it('switches Overview / Courses / Admissions with an accessible segmented control', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    const group = screen.getByTestId('school-segments')
    expect(group.props.accessibilityRole).toBe('radiogroup')
    expect(group.props.accessibilityLabel).toBe('School details')
    const radios = screen.getAllByRole('radio')
    expect(radios.map(r => r.props.accessibilityLabel)).toEqual(['Overview', 'Courses', 'Admissions'])
    expect(aria(screen.getByRole('radio', { name: 'Overview' }), 'aria-checked')).toBe(true)

    showSegment('Courses')
    expect(aria(screen.getByRole('radio', { name: 'Courses' }), 'aria-checked')).toBe(true)
    expect(screen.getByText('Courses offered (2)')).toBeTruthy()
    expect(screen.queryByTestId('school-key-facts')).toBeNull()

    showSegment('Admissions')
    expect(screen.getByLabelText('Difficulty: 4 of 5')).toBeTruthy()
  })

  // ── Overview: key facts, real data only ─────────────────────────────────────

  it('leads with a 2x2 grid of key facts (exam, applications, exam month, tuition), before accreditation', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    expect(screen.getByLabelText('Entrance exam: UP College Admission Test (UPCAT)')).toBeTruthy()
    expect(screen.getByLabelText('Applications: June – August')).toBeTruthy()
    expect(screen.getByLabelText('Exam month: October')).toBeTruthy()
    expect(screen.getByLabelText('Tuition: Free (RA 10931)')).toBeTruthy()
    const order = JSON.stringify(screen.toJSON())
    expect(order.indexOf('June – August')).toBeLessThan(order.indexOf('AUN-QA'))
  })

  it('a fact the catalog does not hold reads "Not yet available", never a guess', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SCHOOL, { ...PROFILE, applicationOpen: null, applicationClose: null, examMonth: null, freeTuition: null, tuitionFeeRange: null }))
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    expect(screen.getByLabelText('Applications: Not yet available')).toBeTruthy()
    expect(screen.getByLabelText('Exam month: Not yet available')).toBeTruthy()
    expect(screen.getByLabelText('Tuition: Not yet available')).toBeTruthy()
  })

  it('shows tinted fact chips, never the same badge twice when the type already says SUC', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({ ...SCHOOL, type: 'SUC' }, PROFILE))
    render(<SchoolProfileScreen />)
    await screen.findByRole('header', { name: 'University of the Philippines Diliman' })
    expect(screen.getAllByText('SUC')).toHaveLength(1)
    expect(screen.getByText('Free tuition')).toBeTruthy()
    expect(screen.getByText('Medium confidence')).toBeTruthy()
  })

  it('external links are links', async () => {
    render(<SchoolProfileScreen />)
    expect(await screen.findByRole('link', { name: 'Official website, opens in your browser' })).toBeTruthy()
  })

  // ── The one primary action ──────────────────────────────────────────────────

  it('has exactly one primary action, "Add to my focus", in the bottom bar', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    expect(screen.getByTestId('school-bottom-bar')).toBeTruthy()
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(1)
    fireEvent.press(screen.getByRole('button', { name: 'Add to my focus' }))
    expect(mockFocus.addListing).toHaveBeenCalledWith('upcat')
  })

  it('once in focus, the capsule says so and removes on press', async () => {
    mockFocus.inFocus = true
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'In my focus #2. Remove from my focus' }))
    expect(mockFocus.removeListing).toHaveBeenCalledWith('upcat')
  })

  it('opens the exam from inside the sheet (a push onto the root stack)', async () => {
    const { router } = require('expo-router')
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'View exam and practise' }))
    expect(router.push).toHaveBeenCalledWith('/listings/upcat')
  })

  // ── Admissions ──────────────────────────────────────────────────────────────

  it('lists the application requirements as a checklist of check circles', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    showSegment('Admissions')
    const item = await screen.findByRole('checkbox', { name: 'Form 138' })
    expect(aria(item, 'aria-checked')).toBe(false)
    expect(screen.getByTestId('check-circle-off', { includeHiddenElements: true })).toBeTruthy()
    // Ticks are kept per school, never mixed with the exam listing's own list.
    expect(mockAcquired).toHaveBeenCalledWith(expect.anything(), 'school:up-diliman')
    await act(async () => { fireEvent.press(item) })
    expect(aria(screen.getByRole('checkbox', { name: 'Form 138' }), 'aria-checked')).toBe(true)
  })

  it('names difficulty in words, not dots alone', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    showSegment('Admissions')
    expect(screen.getByLabelText('Difficulty: 4 of 5')).toBeTruthy()
  })

  describe('a school whose exam has no content of its own (general entrance practice)', () => {
    const OWN_EXAM = { ...PROFILE, entranceExamName: 'Own Entrance Test', entranceExamAcronym: 'OET' }
    beforeEach(() => {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb(SCHOOL, OWN_EXAM))
    })

    it('offers the general entrance mock only when it can actually run', async () => {
      const { router } = require('expo-router')
      mockRunnable.mockResolvedValue([{ slug: 'general-cet' }])
      render(<SchoolProfileScreen />)
      fireEvent.press(await screen.findByRole('button', { name: 'Practise with the general entrance mock' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/school:up-diliman')
    })

    it('without a runnable general mock, offers its topic review honestly', async () => {
      const { router } = require('expo-router')
      mockHasReview.mockResolvedValue(true)
      render(<SchoolProfileScreen />)
      fireEvent.press(await screen.findByRole('button', { name: 'Practise general entrance topics' }))
      expect(router.push).toHaveBeenCalledWith('/practice/start/school:up-diliman')
      expect(screen.queryByRole('button', { name: 'Practise with the general entrance mock' })).toBeNull()
      expect(mockHasReview).toHaveBeenCalledWith(expect.anything(), 'general-cet')
    })

    it('with nothing to practise, no practice row (the school itself can still go into focus)', async () => {
      render(<SchoolProfileScreen />)
      expect(await screen.findByRole('button', { name: 'Add to my focus' })).toBeTruthy()
      expect(await screen.findByText('Practice coming soon')).toBeTruthy()
      expect(screen.queryByRole('button', { name: /Practise/ })).toBeNull()
      fireEvent.press(screen.getByRole('button', { name: 'Add to my focus' }))
      expect(mockFocus.addListing).toHaveBeenCalledWith('school:up-diliman')
    })
  })

  it('without an exam to focus on, there is no bottom bar and no primary action', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SCHOOL, { ...PROFILE, entranceExamName: null, entranceExamAcronym: null }))
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    expect(screen.queryByTestId('school-bottom-bar')).toBeNull()
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(0)
  })

  // ── States ──────────────────────────────────────────────────────────────────

  it('a missing school leads back to Explore: native closes the sheet, web replaces the page', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(null, null))
    const { router } = require('expo-router')
    const r = render(<SchoolProfileScreen />)
    expect(await screen.findByText("We couldn't find this school")).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back to Explore' }))
    expect(router.dismiss).toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    r.unmount()

    Platform.OS = 'web'
    useDb.mockReturnValue(makeDb(null, null))
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Back to Explore' }))
    expect(router.replace).toHaveBeenCalledWith('/explore')
  })

  it('a failed load offers a retry', async () => {
    failFirst = true
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('school-key-facts')).toBeTruthy()
  })
})
