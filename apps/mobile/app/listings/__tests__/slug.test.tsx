import React from 'react'
import { Linking } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import ListingDetailScreen from '../[slug]'
import { aria } from '../../../test-utils/aria'
import { countPrimaryActions } from '../../../test-utils/primaryActions'

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
  listRunnableBlueprints: jest.fn().mockResolvedValue([]),
}))

jest.mock('../../../services/practiceSignals', () => ({
  hasReviewContent: jest.fn().mockResolvedValue(false),
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
  const { listRunnableBlueprints } = require('../../../services/examBlueprints')
  listRunnableBlueprints.mockResolvedValue([])
  const { hasReviewContent } = require('../../../services/practiceSignals')
  hasReviewContent.mockResolvedValue(false)
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

  it('leads with the date: a calm relative time ("In 30 days") and the exact exam date', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByTestId('listing-key-facts')).toBeTruthy()
    expect(screen.getByText('In 30 days')).toBeTruthy()
    expect(screen.getByLabelText('Exam in 30 days')).toBeTruthy()
    expect(screen.getByText('Exam date')).toBeTruthy()
    // The exact date, in words, under its label.
    expect(screen.getByText(/^[A-Z][a-z]{2}, [A-Z][a-z]+ \d{1,2}, \d{4}$/)).toBeTruthy()
  })

  it('uses the large title with an eyebrow naming the kind of listing', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByRole('header', { name: 'UPCAT 2025' })).toBeTruthy()
    expect(screen.getByTestId('large-title-eyebrow').props.children).toBe('Entrance exam')
  })

  it('says Iskotify is not affiliated with the provider, beside the verification badge', async () => {
    render(<ListingDetailScreen />)
    await screen.findByRole('header', { name: 'UPCAT 2025' })
    expect(screen.getByText(/Iskotify isn’t affiliated with or endorsed by UP System\. Details change every year\./)).toBeTruthy()
  })

  it('names no official source when the listing has no external_url', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    expect(screen.queryByTestId('listing-source')).toBeNull()
    expect(screen.queryByText(/Official site:/)).toBeNull()
  })

  it('names the official source host beside the dates when the listing has an external_url', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({ ...BASE_EXAM_LISTING, externalUrl: 'https://www.up.edu.ph/upcat' }))
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    render(<ListingDetailScreen />)
    const source = await screen.findByRole('link', { name: 'Official site: up.edu.ph, opens in your browser' })
    expect(screen.getByText('Official site: up.edu.ph')).toBeTruthy()
    fireEvent.press(source)
    expect(open).toHaveBeenCalledWith('https://www.up.edu.ph/upcat')
    open.mockRestore()
  })

  it('has exactly one primary action (the mock exam) when the mock can run', async () => {
    const { listRunnableBlueprints } = require('../../../services/examBlueprints')
    listRunnableBlueprints.mockResolvedValue([{ slug: 'upcat' }])
    render(<ListingDetailScreen />)
    await screen.findByRole('button', { name: 'Take a mock exam' })
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(1)
  })

  it('puts the key facts BEFORE the actions, and actions before About', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    const order = textOrder()
    const facts = order.indexOf('In 30 days')
    const save = order.indexOf('Add to Focus')
    const about = order.indexOf('"About"')
    expect(facts).toBeGreaterThan(-1)
    expect(facts).toBeLessThan(save)
    expect(save).toBeLessThan(about)
  })

  it('without a runnable mock but with review topics, the primary action opens the exam review chooser', async () => {
    const { router } = require('expo-router')
    const { hasReviewContent } = require('../../../services/practiceSignals')
    hasReviewContent.mockResolvedValue(true)
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Practise for this exam' }))
    expect(router.push).toHaveBeenCalledWith('/practice/start/upcat')
    expect(hasReviewContent).toHaveBeenCalledWith(expect.anything(), 'upcat')
    expect(screen.queryByRole('button', { name: 'Take a mock exam' })).toBeNull()
  })

  it('with nothing to practise yet there is no practice button, just an honest note', async () => {
    render(<ListingDetailScreen />)
    expect(await screen.findByText('Practice coming soon')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Practise for this exam' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Take a mock exam' })).toBeNull()
  })

  it('a published blueprint with no runnable questions never offers the mock', async () => {
    const { listRunnableBlueprints } = require('../../../services/examBlueprints')
    listRunnableBlueprints.mockResolvedValue([{ slug: 'acet' }])
    render(<ListingDetailScreen />)
    expect(await screen.findByText('Practice coming soon')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Take a mock exam' })).toBeNull()
  })

  it('with a runnable blueprint the primary action is the mock exam', async () => {
    const { router } = require('expo-router')
    const { listRunnableBlueprints } = require('../../../services/examBlueprints')
    listRunnableBlueprints.mockResolvedValue([{ slug: 'upcat' }])
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
    expect(aria(about, 'aria-expanded')).toBe(false)
    expect(screen.queryByText(BASE_EXAM_LISTING.description)).toBeNull()
    fireEvent.press(about)
    expect(screen.getByText(BASE_EXAM_LISTING.description)).toBeTruthy()
  })

  it('Coverage is a collapsed disclosure', async () => {
    render(<ListingDetailScreen />)
    const cov = await screen.findByRole('button', { name: 'Coverage' })
    expect(aria(cov, 'aria-expanded')).toBe(false)
    fireEvent.press(cov)
    expect(screen.getByRole('button', { name: 'Coverage', expanded: true })).toBeTruthy()
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

  it('leads with the deadline: "In 60 days" and the exact deadline', async () => {
    render(<ListingDetailScreen />)
    await screen.findByTestId('listing-key-facts')
    expect(screen.getByText('In 60 days')).toBeTruthy()
    expect(screen.getByLabelText('Deadline in 60 days')).toBeTruthy()
    expect(screen.getByText('Application deadline')).toBeTruthy()
  })

  it('with an official URL: exactly one primary action, and the source host beside the deadline', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({ ...BASE_SCHOLARSHIP_LISTING, externalUrl: 'https://sei.dost.gov.ph/apply' }))
    render(<ListingDetailScreen />)
    await screen.findByRole('link', { name: 'Apply on the official site' })
    expect(countPrimaryActions(screen.UNSAFE_root)).toBe(1)
    expect(screen.getByText('Official site: sei.dost.gov.ph')).toBeTruthy()
  })

  it('with no profile, eligibility invites the student to complete it', async () => {
    const { router } = require('expo-router')
    render(<ListingDetailScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Complete profile' }))
    expect(router.push).toHaveBeenCalledWith('/profile/scholarship-info')
  })

  it('with a profile, eligibility shows a labelled status before the actions', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockResolvedValue({ gwa: 95, province: 'Albay', incomeBracket: '<=100k', gradeLevel: 'G12', sensitiveConsentAt: 1_700_000_000_000 })
    render(<ListingDetailScreen />)
    const status = await screen.findByText(/^(Eligible|Maybe eligible|Not eligible)$/)
    const order = textOrder()
    expect(order.indexOf(`"${status.props.children}"`)).toBeLessThan(order.indexOf('Add to Focus'))
  })

  it('without consent to use grades and income, a stored GWA is ignored: it invites the student to add details instead of a verdict', async () => {
    const { getSettings } = require('../../../services/settings')
    getSettings.mockResolvedValue({ gwa: 95, province: 'Albay', incomeBracket: '<=100k', gradeLevel: 'G12', sensitiveConsentAt: 0 })
    render(<ListingDetailScreen />)
    expect(await screen.findByRole('button', { name: 'Complete profile' })).toBeTruthy()
    expect(screen.queryByText(/^(Eligible|Not eligible)$/)).toBeNull()
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

  it('on web the apply action is a real anchor (middle-click, copy link, links list)', async () => {
    const { Platform } = require('react-native')
    const originalOS = Platform.OS
    Platform.OS = 'web'
    try {
      const { useDb } = require('../../../hooks/useDb')
      useDb.mockReturnValue(makeDb({ ...BASE_SCHOLARSHIP_LISTING, externalUrl: 'https://sei.dost.gov.ph' }))
      render(<ListingDetailScreen />)
      const apply = await screen.findByRole('link', { name: 'Apply on the official site' })
      expect(apply.props.href).toBe('https://sei.dost.gov.ph')
      expect(apply.props.hrefAttrs).toEqual({ target: '_blank', rel: 'noopener noreferrer' })
    } finally {
      Platform.OS = originalOS
    }
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
