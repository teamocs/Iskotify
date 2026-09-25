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
}))
const mockBest = jest.fn()
jest.mock('../../../../services/homeAggregates', () => ({
  getListingMockBest: (...a: any[]) => mockBest(...a),
  getListingAccuracy: jest.fn().mockResolvedValue([]),
}))

const UPCAT = { slug: 'upcat', name: 'UPCAT', acronym: 'UPCAT', totalItems: 180, totalTimeMinutes: 150 }
const ACET = { slug: 'acet', name: 'ACET', acronym: 'ACET', totalItems: 100, totalTimeMinutes: 45 }

describe('Mock exams list (redesign M2)', () => {
  beforeEach(() => {
    mockPush.mockClear(); mockBack.mockClear()
    mockSlugs.mockReset().mockResolvedValue(['upcat', 'acet'])
    mockGet.mockReset().mockImplementation(async (_db: unknown, slug: string) => (slug === 'upcat' ? UPCAT : ACET))
    mockBest.mockReset().mockResolvedValue([{ listingSlug: 'upcat', bestPct: 72 }])
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
