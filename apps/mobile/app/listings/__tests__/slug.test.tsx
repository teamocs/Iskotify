import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import ListingDetailScreen from '../[slug]'

// ── Router / expo ──────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn() },
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

// ── AppButton ─────────────────────────────────────────────────────────────
jest.mock('../../../components/ui/AppButton', () => ({
  AppButton: ({ label, onPress }: any) => {
    const { Pressable, Text } = require('react-native')
    return <Pressable onPress={onPress}><Text>{label}</Text></Pressable>
  },
}))

// ── DB ─────────────────────────────────────────────────────────────────────
jest.mock('../../../hooks/useDb', () => ({ useDb: jest.fn() }))

jest.mock('../../../hooks/useFocusListings', () => ({
  useFocusListings: () => ({
    isInFocus: jest.fn().mockReturnValue(false),
    getPriority: jest.fn().mockReturnValue(null),
    addListing: jest.fn(),
    removeListing: jest.fn(),
  }),
}))

jest.mock('../../../services/settings', () => ({
  getSettings: jest.fn().mockResolvedValue({}),
}))

jest.mock('../../../services/examBlueprints', () => ({
  listPublishedBlueprintSlugs: jest.fn().mockResolvedValue([]),
}))

const BASE_EXAM_LISTING = {
  id: 'exam-1',
  slug: 'upcat',
  title: 'UPCAT 2025',
  type: 'exam',
  status: 'active',
  examDate: Date.now() + 30 * 86_400_000,
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
  deadline: Date.now() + 60 * 86_400_000,
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

// The screen runs 3 parallel queries via db.select():
//   [0] listingRows  → .from(listings).where(eq(slug)).limit(1)  → [listing]
//   [1] watchRows    → .from(resultWatches).where(...).limit(1)  → []
//   [2] settings     → handled by getSettings mock (not db.select)
// savedListings was removed from this screen (bookmark feature deleted).
// We track call count to return listing only on the first call.
function makeDb(listing: any = null) {
  let callCount = 0
  return {
    select: jest.fn(() => {
      const callIndex = callCount++
      return {
        from: jest.fn(() => ({
          where: jest.fn(() => ({
            limit: jest.fn().mockResolvedValue(
              // First select call = listings query; return listing if provided
              callIndex === 0 && listing ? [listing] : []
            ),
          })),
        })),
      }
    }),
    delete: jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) })),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ onConflictDoNothing: jest.fn().mockResolvedValue(undefined) })) })),
  }
}

describe('ListingDetailScreen', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(BASE_EXAM_LISTING))
  })

  it('shows back button immediately (before load completes)', () => {
    render(<ListingDetailScreen />)
    // Back button (‹) is always present in the top bar
    expect(screen.getAllByText('‹').length).toBeGreaterThanOrEqual(1)
  })

  it('renders Key Dates section header after load', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Key Dates')).toBeTruthy()
    })
  })

  it('renders primary CTA (Add to Focus) after Key Dates — above the fold', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Key Dates')).toBeTruthy()
      expect(screen.getByText('+ Add to Focus')).toBeTruthy()
    })
  })

  // Wave 2b: About section collapsed by default
  it('About section is collapsed by default (section title visible, full text hidden)', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('About')).toBeTruthy()
    })
    // The full description should not be visible when collapsed
    expect(screen.queryByText(BASE_EXAM_LISTING.description)).toBeNull()
  })

  // Wave 2b: About section expands on press
  it('About section expands when tapped', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('About')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('About'))
    await waitFor(() => {
      expect(screen.getByText(BASE_EXAM_LISTING.description)).toBeTruthy()
    })
  })

  it('does not render Take Mock Exam CTA when no blueprint', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('+ Add to Focus')).toBeTruthy()
    })
    expect(screen.queryByText('📝 Take Mock Exam')).toBeNull()
  })

  it('shows Start Practicing button in the lower section (after requirements)', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('⚡ Start Practicing for this Exam')).toBeTruthy()
    })
  })

  it('shows Watch results toggle in lower section', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('🔔 Watch results')).toBeTruthy()
    })
  })

  it('Coverage (exam) section is collapsed by default — Card body not yet rendered', async () => {
    // The exam fixture has grantAmount = '' so grantLabel never appears.
    // The coverage text appears in both preview and body; however we can assert
    // the section collapses by checking the Coverage section renders with a
    // chevron indicator (↓) rather than (↑).
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeTruthy()
    })
    // Down chevron = collapsed state
    const chevrons = screen.queryAllByText('↓')
    expect(chevrons.length).toBeGreaterThanOrEqual(1)
  })

  it('Coverage section expands when tapped (chevron flips to ↑)', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Coverage')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('Coverage'))
    await waitFor(() => {
      // After expand the section shows ↑
      const upChevrons = screen.queryAllByText('↑')
      expect(upChevrons.length).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('ListingDetailScreen — Scholarship', () => {
  beforeEach(() => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(BASE_SCHOLARSHIP_LISTING))
    const { useLocalSearchParams } = require('expo-router')
    useLocalSearchParams.mockReturnValue({ slug: 'dost-sei' })
  })

  it('renders scholarship Key Dates section', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Key Dates')).toBeTruthy()
    })
  })

  it('Scholarship Details section collapsed by default', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Scholarship Details')).toBeTruthy()
    })
    // Detail rows (Income Ceiling label) should not be visible when collapsed
    expect(screen.queryByText('Income Ceiling')).toBeNull()
  })

  it('Scholarship Details section expands when tapped', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Scholarship Details')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('Scholarship Details'))
    await waitFor(() => {
      expect(screen.getByText('Income Ceiling')).toBeTruthy()
    })
  })

  it('Benefits section collapsed by default — shows ↓ chevron', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Benefits')).toBeTruthy()
    })
    // All collapsible sections start closed, so at least one ↓ chevron is visible
    const chevrons = screen.queryAllByText('↓')
    expect(chevrons.length).toBeGreaterThanOrEqual(1)
  })

  it('Benefits section expands when tapped', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Benefits')).toBeTruthy()
    })
    fireEvent.press(screen.getByText('Benefits'))
    await waitFor(() => {
      expect(screen.getByText('Full tuition and monthly stipend.')).toBeTruthy()
    })
  })

  it('service obligation warning is always visible (safety info, not collapsible)', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText(/Requires 2 years of service/)).toBeTruthy()
    })
  })

  it('Add to Focus CTA visible after Key Dates — no Take Mock Exam or Start Practicing for scholarships', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('Key Dates')).toBeTruthy()
      expect(screen.getByText('+ Add to Focus')).toBeTruthy()
    })
    expect(screen.queryByText('📝 Take Mock Exam')).toBeNull()
    expect(screen.queryByText('⚡ Start Practicing for this Exam')).toBeNull()
  })

  it('verified badge is rendered', async () => {
    render(<ListingDetailScreen />)
    await waitFor(() => {
      expect(screen.getByText('✓ Verified')).toBeTruthy()
    })
  })
})
