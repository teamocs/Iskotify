import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import CourseSchoolsScreen from '../[code]'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ code: 'CPA' })),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../../hooks/useDb', () => ({ useDb: jest.fn() }))

// ---------------------------------------------------------------------------
// DB mock — the screen's cached fetcher runs, in order:
//   1. taxonomy: select().from().where().limit()
//   2. rankings: select().from().where()        (awaited directly)
//   3. ai:       select().from().where().limit() (only if careerCourseId)
// ---------------------------------------------------------------------------

function makeDb(taxRows: any[], rankRows: any[], aiRows: any[] = []) {
  let call = 0
  const select = jest.fn(() => {
    call++
    if (call === 1) {
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve(taxRows) }) }) }
    }
    if (call === 2) {
      return { from: () => ({ where: () => Promise.resolve(rankRows) }) }
    }
    return { from: () => ({ where: () => ({ limit: () => Promise.resolve(aiRows) }) }) }
  })
  return { select }
}

function seedRanks(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    rank: i + 1,
    schoolName: `School ${i + 1}`,
    region: 'NCR',
    wilsonScore: 0.9,
    rawPassRate: 95,
    totalExaminees: 100,
  }))
}

const TAX = [{ courseTab: 'CPA', careerCourseId: null, label: 'Accountancy' }]

describe('CourseSchoolsScreen ([code]) — progressive rendering + cache', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    const { _clearForTests } = require('../../../../services/queryCache')
    _clearForTests()
    const { useLocalSearchParams } = require('expo-router')
    useLocalSearchParams.mockReturnValue({ code: 'CPA' })
  })

  it('renders only the first page of a large ranking list', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(TAX, seedRanks(50)))
    render(<CourseSchoolsScreen />)
    await waitFor(() => expect(screen.getByText('School 1')).toBeTruthy())
    expect(screen.getByText('School 20')).toBeTruthy()
    // The 21st row must NOT be mounted up front — that's the render-cost fix.
    expect(screen.queryByText('School 21')).toBeNull()
  })

  it('advances the visible page when "Show more" is tapped', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(TAX, seedRanks(50)))
    render(<CourseSchoolsScreen />)
    await waitFor(() => expect(screen.getByText('School 1')).toBeTruthy())
    // Footer reflects the paged window deterministically (FlatList item windowing
    // in jsdom can't be relied on; visibleCount is the source of truth).
    expect(screen.getByText('Show more · 20 of 50')).toBeTruthy()
    // Scroll onEndReached drives the same handler in-app; the button is the testable path.
    fireEvent.press(screen.getByTestId('load-more'))
    await waitFor(() => expect(screen.getByText('Show more · 40 of 50')).toBeTruthy())
  })

  it('caches rankings by course code — no re-query on remount within TTL', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const db = makeDb(TAX, seedRanks(10))
    useDb.mockReturnValue(db)
    const first = render(<CourseSchoolsScreen />)
    await waitFor(() => expect(screen.getByText('School 1')).toBeTruthy())
    const callsAfterFirst = db.select.mock.calls.length
    first.unmount()
    render(<CourseSchoolsScreen />)
    await waitFor(() => expect(screen.getByText('School 1')).toBeTruthy())
    expect(db.select.mock.calls.length).toBe(callsAfterFirst)
  })
})
