import React from 'react'
import { Linking } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import ListingDetailScreen from '../[slug]'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

// ── Router / expo ──────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({ slug: 'upcat' })),
}))

// ── Safe area ──────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

// ── ScreenScroll (just render children) ───────────────────────────────────
jest.mock('../../../components/ui/ScreenScroll', () => ({
  ScreenScroll: ({ children }: any) => children,
}))

// ── RequirementsChecklist ─────────────────────────────────────────────────
jest.mock('../../../components/RequirementsChecklist', () => ({
  RequirementsChecklist: () => null,
}))

// ── DB ─────────────────────────────────────────────────────────────────────
jest.mock('../../../hooks/useDb', () => ({ useDb: jest.fn() }))

const mockFocus = { inFocus: false, addListing: jest.fn(), removeListing: jest.fn() }
jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    isInFocus: () => mockFocus.inFocus,
    getPriority: () => (mockFocus.inFocus ? 1 : null),
    addListing: mockFocus.addListing,
    removeListing: mockFocus.removeListing,
  }),
}))

jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
}))

jest.mock('../../../services/examBlueprints', () => ({
  listPublishedBlueprintSlugs: jest.fn().mockResolvedValue([]),
}))

const DAY = 86_400_000

const BASE_EXAM_LISTING = {
  id: 'exam-1',
  slug: 'upcat',
  title: 'UPCAT 2025',
  type: 'exam',
  status: 'active',
  // Exactly 30 calendar days out: the countdown counts whole days.
  examDate: Date.now() + 30 * DAY,
  deadline: null,
  region: 'National',
  description: 'University of the Philippines College Admissions Test. This is a very long description that should be truncated in the preview to about 60 characters.',
  requirements: '[]',
  coverage: 'Filipino, Science, Math, Reading Comprehension',
  provider: 'UP System',
  externalUrl: '',
  grantAmount: '',
  resultsDate: null,
  province: null,
  city: null,
  scope: 'national',
  isVerified: false,
  incomeCeiling: null,
  gwaRequirement: null,
  monthlyStipend: null,
  serviceObligationYears: null,
  hasEntranceExam: true,
  applicationWindow: null,
  scholarshipMeta: '{}',
}

const BASE_SCHOLARSHIP_LISTING = {
  ...BASE_EXAM_LISTING,
  id: 'sch-1',
  slug: 'dost-sei',
  title: 'DOST-SEI Scholarship',
  type: 'scholarship',
  examDate: null,
  deadline: Date.now() + 60 * DAY,
  description: 'Science scholarship for outstanding students.',
  coverage: 'Full tuition and monthly stipend.',
  provider: 'DOST',
  isVerified: true,
  incomeCeiling: 300_000,
  gwaRequirement: 85,
  monthlyStipend: 5_000,
  serviceObligationYears: 2,
  scholarshipMeta: '{}',
}

// The screen runs parallel queries via db.select():
//   [0] listingRows  → .from(listings).where(eq(slug)).limit(1)  → [listing]
//   [1] watchRows    → .from(resultWatches).where(...).limit(1)  → []
// Settings come from the getSettings mock.
function makeDb(listing: any = null) {
  let callCount = 0
  return {
    select: jest.fn(() => {
      const callIndex = callCount++
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue(
              callIndex % 2 === 0 && listing ? [listing] : [],
            ),
          })),
        })),
      }
    }),
    delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) })) })),
  }
}

/** Every rendered string, in document order — for hierarchy assertions. */
function textOrder(): string {
  return JSON.stringify(screen.toJSON())
}

function resetMocks() {
  jest.clearAllMocks()
  mockFocus.inFocus = false
  const { getSettings } = require('../../../services/settings')
  getSettings.mockResolvedValue({})
  const { listPublishedBlueprintSlugs } = require('../../../services/examBlueprints')
  listPublishedBlueprintSlugs.mockResolvedValue([])
  const { router } = require('expo-router')
  router.canGoBack.mockReturnValue(true)
}

describe('ListingDetailScreen — exam', () => {
  beforeEach(() => {
    resetMocks()
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(BASE_EXAM_LISTING))
    const { useLocalSearchParams } = require('expo-router')
    useLocalSearchParams.mockReturnValue({ slug: 'upcat' })
  })

  it('shows a labelled back button and a skeleton before the listing loads', () => {
    render(<ListingDetailScreen />)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.getByTestId('listing-skeleton')).toBeTruthy()
  })

  it('back falls back to Explore after a deep link (no history)', async () => {
    const { router } = require('expo-router')
    router.canGoBack.mockReturnValue(false)
    render(<ListingDetailScreen />)
    await screen.findByRole('header', { name: 'UPCAT 2025' })
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(router.replace).toHaveBeenCalledWith('/explore?section=universities')
  })

  it('leads with the date: a tabular countdown and the exam date', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByTestId('listing-key-facts')).toBeTruthy()
    expect(screen.getByText('30')).toBeTruthy()
    expect(screen.getByText('days until the exam')).toBeTruthy()
    expect(screen.getByText('Exam date')).toBeTruthy()
  })

  it('puts the key facts BEFORE the actions, and actions before About', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    const order = textOrder()
    const facts = order.indexOf('days until the exam')
    const save = order.indexOf('Add to Focus')
    const about = order.indexOf('"About"')
    expect(facts).toBeGreaterThan(-1)
    expect(facts).toBeLessThan(save)
    expect(save).toBeLessThan(about)
  })

  it('without a mock blueprint the primary action is practice', async () => {
    const { router } = require('expo-router')
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Practise for this exam' }))
    expect(router.push).toHaveBeenCalledWith('/(tabs)/practice')
    expect(screen.queryByRole('button', { name: 'Take a mock exam' })).toBeNull()
  })

  it('with a published blueprint the primary action is the mock exam', async () => {
    const { router } = require('expo-router')
    const { listPublishedBlueprintSlugs } = require('../../../services/examBlueprints')
    listPublishedBlueprintSlugs.mockResolvedValue(['upcat'])
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Take a mock exam' }))
    expect(router.push).toHaveBeenCalledWith('/practice/exam/upcat')
    expect(screen.queryByRole('button', { name: 'Practise for this exam' })).toBeNull()
  })

  it('the save action adds to Focus', async () => {
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Add to Focus' }))
    expect(mockFocus.addListing).toHaveBeenCalledWith('upcat')
  })

  it('when saved, the save action says so and removes on press', async () => {
    mockFocus.inFocus = true
    render(<ListingDetailScreen />)
    const saved = await screen.findByRole('button', { name: 'In Focus #1. Remove from Focus' })
    fireEvent.press(saved)
    expect(mockFocus.removeListing).toHaveBeenCalledWith('upcat')
  })

  it('watch results toggles and persists', async () => {
    const { useDb } = require('../../../hooks/useDb')
    const db = makeDb(BASE_EXAM_LISTING)
    useDb.mockReturnValue(db)
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Watch results' }))
    expect(await screen.findByRole('button', { name: 'Watching results' })).toBeTruthy()
    expect(db.insert).toHaveBeenCalled()
  })

  it('About is a collapsed disclosure that reveals the description', async () => {
    render(<ListingDetailScreen />)
    const about = await screen.findByRole('button', { name: 'About' })
    expect(about.props.accessibilityState).toEqual({ expanded: false })
    expect(screen.queryByText(BASE_EXAM_LISTING.description)).toBeNull()
    fireEvent.press(about)
    expect(screen.getByText(BASE_EXAM_LISTING.description)).toBeTruthy()
  })

  it('Coverage is a collapsed disclosure', async () => {
    render(<ListingDetailScreen />)
    const cov = await screen.findByRole('button', { name: 'Coverage' })
    expect(cov.props.accessibilityState).toEqual({ expanded: false })
    fireEvent.press(cov)
    expect(screen.getByRole('button', { name: 'Coverage' }).props.accessibilityState).toEqual({ expanded: true })
  })

  it('renders no emoji or glyph icons', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    expect(textOrder()).not.toMatch(/[📝⚡🔔📍🎓📋‹↑↓✎]/u)
  })

  it('a missing listing gets an empty state that leads back to Explore', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(null))
    const { router } = require('expo-router')
    render(<ListingDetailScreen />)
    expect(await screen.findByText("We couldn't find this listing")).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back to Explore' }))
    expect(router.replace).toHaveBeenCalledWith('/explore')
  })

  it('a failed load shows a retry, which reloads', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockRejectedValueOnce(new Error('offline'))
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('listing-key-facts')).toBeTruthy()
  })
})

describe('ListingDetailScreen — scholarship', () => {
  beforeEach(() => {
    resetMocks()
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(BASE_SCHOLARSHIP_LISTING))
    const { useLocalSearchParams } = require('expo-router')
    useLocalSearchParams.mockReturnValue({ slug: 'dost-sei' })
  })

  it('leads with the deadline countdown', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    expect(screen.getByText('60')).toBeTruthy()
    expect(screen.getByText('days left to apply')).toBeTruthy()
    expect(screen.getByText('Application deadline')).toBeTruthy()
  })

  it('with no profile, eligibility invites the student to complete it', async () => {
    const { router } = require('expo-router')
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Complete profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile/scholarship-info')
  })

  it('with a profile, eligibility shows a labelled status before the actions', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockResolvedValue({ gwa: 95, province: 'Albay', incomeBracket: '<=100k', gradeLevel: 'G12' })
    render(<ListingDetailScreen />)
    const status = await screen.findByText(/^(Eligible|Maybe eligible|Not eligible)$/)
    const order = textOrder()
    expect(order.indexOf(`"${status.props.children}"`)).toBeLessThan(order.indexOf('Add to Focus'))
  })

  it('the service obligation is visible without expanding anything', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByText(/Requires 2 years of service/)).toBeTruthy()
  })

  it('with an official URL the primary action is to apply there', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({ ...BASE_SCHOLARSHIP_LISTING, externalUrl: 'https://sei.dost.gov.ph' }))
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('link', { name: 'Apply on the official site' }))
    expect(open).toHaveBeenCalledWith('https://sei.dost.gov.ph')
  })

  it('has no exam-only actions', async () => {
    render(<ListingDetailScreen />)
    await screen.findByRole('button', { name: 'Add to Focus' })
    expect(screen.queryByRole('button', { name: 'Take a mock exam' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Practise for this exam' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Watch results' })).toBeNull()
  })

  it('Scholarship details and Benefits are collapsed disclosures', async () => {
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Scholarship details' }))
    expect(screen.getByText('Income ceiling')).toBeTruthy()
    expect(screen.queryByText('Full tuition and monthly stipend.')).toBeNull()
    fireEvent.press(screen.getByRole('button', { name: 'Benefits' }))
    expect(screen.getByText('Full tuition and monthly stipend.')).toBeTruthy()
  })

  it('states whether the listing is verified', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByText('Verified')).toBeTruthy()
  })
})
