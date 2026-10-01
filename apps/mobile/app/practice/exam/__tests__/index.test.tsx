import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react-native'
import ExamPicker from '../index'

const mockPush = jest.fn()
const mockBack = jest.fn()
jest.mock('expo-router', () => ({ router: { push: (...a: any[]) => mockPush(...a), back: (...a: any[]) => mockBack(...a) } }))
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }))
jest.mock('../../../../hooks/useDb', () => {
  const db = {}
  return { useDb: () => db }
})

const mockSlugs = jest.fn()
const mockGet = jest.fn()
jest.mock('../../../../services/examBlueprints', () => ({
  listPublishedBlueprintSlugs: (...a: any[]) => mockSlugs(...a),
  getExamBlueprint: (...a: any[]) => mockGet(...a),
  getQuestionsByCategory: (...a: any[]) => mockLoadPools(...a),
  getRunnableCountsByCategory: (...a: any[]) => mockCounts(...a),
}))
const mockCounts = jest.fn()
const mockLoadPools = jest.fn()
const mockBest = jest.fn()
jest.mock('../../../../services/homeAggregates', () => ({
  getListingMockBest: (...a: any[]) => mockBest(...a),
  getListingAccuracy: jest.fn().mockResolvedValue([]),
}))

const sec = (skillCategory: string, itemCount = 10) => [{ id: skillCategory, name: skillCategory, skillCategory, itemCount, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 }]
const UPCAT = { slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 150, sections: sec('Mathematics', 180) }
const ACET = { slug: 'acet', name: 'ACET', acronym: 'ACET', totalItems: 100, totalTimeMinutes: 45, sections: sec('Verbal', 100) }

describe('Mock exams list (redesign M2)', () => {
  beforeEach(() => {
    mockPush.mockClear(); mockBack.mockClear()
    mockSlugs.mockReset().mockResolvedValue(['upcat', 'acet'])
    mockGet.mockReset().mockImplementation(async (_db: unknown, slug: string) => (slug === 'upcat' ? UPCAT : ACET))
    mockBest.mockReset().mockResolvedValue([{ listingSlug: 'upcat', bestPct: 72 }])
    mockLoadPools.mockReset().mockRejectedValue(new Error('the picker must not load every question row'))
    mockCounts.mockReset().mockResolvedValue(new Map([['Mathematics', 500], ['Verbal', 500]]))
  })

  it('has a header and a named Back control', async () => {
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByRole('header', { name: 'Mock exams' })).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back' }))
    expect(mockBack).toHaveBeenCalled()
  })

  it('shows skeletons while loading', () => {
    mockSlugs.mockReturnValue(new Promise(() => {}))
    render(<ExamPicker />)
    expect(screen.getByLabelText('Loading mock exams')).toBeTruthy()
  })

  it('lists each mock with size, length and best score as a neutral number', async () => {
    render(<ExamPicker />)
    await act(async () => {})
    const row = screen.getByRole('button', { name: 'UPCAT, 180 items, 2.5 h, best 72%' })
    expect(screen.getByRole('button', { name: 'ACET, 100 items, 45 min, not taken yet' })).toBeTruthy()
    fireEvent.press(row)
    expect(mockPush).toHaveBeenCalledWith('/practice/exam/upcat')
    // No coloured verdict badges.
    const tree = JSON.stringify(screen.toJSON())
    // Status tints from the theme mock (success/warning/danger surfaces).
    for (const tint of ['rgba(74,222,128,0.16)', 'rgba(251,191,36,0.16)', 'rgba(248,113,113,0.16)']) expect(tree).not.toContain(tint)
  })

  // Logic audit B: a published blueprint whose sections have no runnable questions
  // (nothing synced yet, or every question is missing its figure) is not a ready mock.
  it('does not list a published exam with no runnable questions as ready', async () => {
    mockCounts.mockResolvedValue(new Map([['Mathematics', 500]])) // nothing for the ACET Verbal section
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: /^UPCAT/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^ACET/ })).toBeNull()
    expect(screen.getByText('Questions coming soon')).toBeTruthy()
  })

  it('a category whose runnable count is zero (e.g. only figure-less visual questions) is not ready', async () => {
    mockCounts.mockResolvedValue(new Map([['Mathematics', 500], ['Verbal', 0]]))
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.queryByRole('button', { name: /^ACET/ })).toBeNull()
  })

  it('never loads full question rows: it asks for counts of the blueprint categories only', async () => {
    render(<ExamPicker />)
    await act(async () => {})
    expect(mockLoadPools).not.toHaveBeenCalled()
    expect(mockCounts).toHaveBeenCalledTimes(1)
    expect([...mockCounts.mock.calls[0][1]].sort()).toEqual(['Mathematics', 'Verbal'])
  })

  it('shows the item count the prestart will build: min(item_count, available), empty sections left out', async () => {
    mockGet.mockImplementation(async (_db: unknown, slug: string) => (slug === 'upcat'
      ? { ...UPCAT, sections: [...sec('Mathematics', 180), { ...sec('Verbal', 50)[0]!, id: 'v', displayOrder: 2 }, { ...sec('Spatial', 40)[0]!, id: 'sp', displayOrder: 3 }] }
      : ACET))
    mockCounts.mockResolvedValue(new Map([['Mathematics', 60], ['Verbal', 500], ['Spatial', 0]]))
    render(<ExamPicker />)
    await act(async () => {})
    // 60 (pool smaller than 180) + 50 + 0 (nothing runnable in Spatial)
    expect(screen.getByRole('button', { name: 'UPCAT, 110 items, 2.5 h, best 72%' })).toBeTruthy()
  })

  it('sizes a mock from its sections, not a drifted total_items (DOST-SEI: 170 vs 210)', async () => {
    mockGet.mockImplementation(async (_db: unknown, slug: string) => (slug === 'upcat'
      ? { ...UPCAT, totalItems: 170, sections: [...sec('Mathematics', 100), { ...sec('Mathematics')[0]!, id: 'm2', itemCount: 110 }] }
      : ACET))
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'UPCAT, 210 items, 2.5 h, best 72%' })).toBeTruthy()
  })

  it('times a section-locked exam by its section clocks, not the declared total', async () => {
    mockGet.mockImplementation(async (_db: unknown, slug: string) => (slug === 'acet'
      ? { ...ACET, sectionBlocked: true, totalTimeMinutes: 999, sections: [{ ...sec('Verbal', 100)[0]!, timeMinutes: 45 }] }
      : UPCAT))
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'ACET, 100 items, 45 min, not taken yet' })).toBeTruthy()
  })

  it('shows an empty state when none are published', async () => {
    mockSlugs.mockResolvedValue([])
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByText('No mock exams yet')).toBeTruthy()
  })

  it('shows a retryable error when loading fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    mockSlugs.mockRejectedValueOnce(new Error('offline'))
    render(<ExamPicker />)
    await act(async () => {})
    expect(screen.getByText("Couldn't load mock exams")).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    await act(async () => {})
    expect(screen.getByRole('button', { name: /^UPCAT/ })).toBeTruthy()
    warn.mockRestore()
  })
})
