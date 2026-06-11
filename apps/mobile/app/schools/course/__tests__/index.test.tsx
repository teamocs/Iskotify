import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import CoursePickerScreen from '../index'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// expo-router: inline jest.fn() calls inside the factory to avoid hoisting issues.
jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

// ---------------------------------------------------------------------------
// DB mock factory
//
// The screen does in Promise.all:
//   1. db.select({...}).from(userSettings).where(...).limit(1)  → settingsRows
//   2. db.select({...}).from(taxonomyTable)                     → taxRows
//
// Each call to makeDb() returns a fresh db object with its own callIndex.
// ---------------------------------------------------------------------------

function makeDb(settingsRows: any[] = [], taxRows: any[] = []) {
  let callIndex = 0
  return {
    select: jest.fn(() => {
      callIndex++
      if (callIndex % 2 === 1) {
        // Call 1, 3, 5… → userSettings select: needs .from().where().limit()
        return {
          from: jest.fn(() => ({
            where: jest.fn(() => ({
              limit: jest.fn().mockResolvedValue(settingsRows),
            })),
          })),
        }
      } else {
        // Call 2, 4, 6… → taxonomyTable select: .from() resolves directly
        return {
          from: jest.fn().mockResolvedValue(taxRows),
        }
      }
    }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoursePickerScreen', () => {
  // Grab the mocked router after mocks are set up (avoids hoisting issues)
  let routerMock: { push: jest.Mock; back: jest.Mock; replace: jest.Mock }

  beforeEach(() => {
    const expoRouter = require('expo-router')
    routerMock = expoRouter.router
    routerMock.push.mockClear()
    routerMock.back.mockClear()
    routerMock.replace.mockClear()
    // The screen now loads via useCourseTabOptions → cachedQuery; clear the
    // module-level cache so each test's db mock is actually consulted.
    const { _clearForTests } = require('../../../../services/queryCache')
    _clearForTests()
  })

  it('shows screen title after data loads', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const taxRows = [{ courseTab: 'NLE', careerCourseId: 'HLT-002', label: 'Nursing' }]
    useDb.mockReturnValue(makeDb([], taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => {
      expect(screen.getByText('Top Universities by Course')).toBeTruthy()
    })
  })

  it('shows friendly empty-db message when taxonomy table is empty', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    useDb.mockReturnValue(makeDb([], []))
    render(<CoursePickerScreen />)
    await waitFor(() => {
      expect(screen.getByText(/Course list is still loading/)).toBeTruthy()
    })
  })

  it('renders "All courses" section with taxonomy rows', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const taxRows = [
      { courseTab: 'NLE',  careerCourseId: 'HLT-002', label: 'Nursing' },
      { courseTab: 'CPA',  careerCourseId: 'BUS-001', label: 'Accountancy (CPA)' },
    ]
    useDb.mockReturnValue(makeDb([], taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => {
      expect(screen.getByText('All courses')).toBeTruthy()
      expect(screen.getByText('Nursing')).toBeTruthy()
      expect(screen.getByText('Accountancy (CPA)')).toBeTruthy()
    })
  })

  it('renders "Your target courses" section when target course resolves via tax: prefix', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const settingsRows = [
      {
        targetCourses: JSON.stringify([
          { id: 'tax:NLE', label: 'Nursing', careerCourseId: null },
        ]),
      },
    ]
    const taxRows = [
      { courseTab: 'NLE',  careerCourseId: 'HLT-002', label: 'Nursing' },
      { courseTab: 'CPA',  careerCourseId: 'BUS-001', label: 'Accountancy (CPA)' },
    ]
    useDb.mockReturnValue(makeDb(settingsRows, taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => {
      expect(screen.getByText('Your target courses')).toBeTruthy()
      expect(screen.getByText('All courses')).toBeTruthy()
    })
  })

  it('hides "Your target courses" section when no target courses set', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const taxRows = [{ courseTab: 'NLE', careerCourseId: null, label: 'Nursing' }]
    useDb.mockReturnValue(makeDb([], taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => {
      expect(screen.queryByText('Your target courses')).toBeNull()
      expect(screen.getByText('All courses')).toBeTruthy()
    })
  })

  it('pressing a row in All courses pushes the correct route', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const taxRows = [{ courseTab: 'NLE', careerCourseId: 'HLT-002', label: 'Nursing' }]
    useDb.mockReturnValue(makeDb([], taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => expect(screen.getByText('Nursing')).toBeTruthy())
    fireEvent.press(screen.getByText('Nursing'))
    expect(routerMock.push).toHaveBeenCalledWith('/schools/course/NLE')
  })

  it('pressing a target-course row pushes the correct route', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const settingsRows = [
      {
        targetCourses: JSON.stringify([
          { id: 'tax:CPA', label: 'Accountancy', careerCourseId: null },
        ]),
      },
    ]
    const taxRows = [
      { courseTab: 'CPA', careerCourseId: 'BUS-001', label: 'Accountancy (CPA)' },
    ]
    useDb.mockReturnValue(makeDb(settingsRows, taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => expect(screen.getByText('Your target courses')).toBeTruthy())
    // tax: prefix uses course.label from JSON ("Accountancy"), not taxRow.label ("Accountancy (CPA)")
    fireEvent.press(screen.getByText('Accountancy'))
    expect(routerMock.push).toHaveBeenCalledWith('/schools/course/CPA')
  })

  it('sorts All courses alphabetically by label', async () => {
    const { useDb } = require('../../../../hooks/useDb')
    const taxRows = [
      { courseTab: 'NLE',  careerCourseId: null, label: 'Nursing' },
      { courseTab: 'CPA',  careerCourseId: null, label: 'Accountancy (CPA)' },
      { courseTab: 'CE',   careerCourseId: null, label: 'Civil Engineering' },
    ]
    useDb.mockReturnValue(makeDb([], taxRows))
    render(<CoursePickerScreen />)
    await waitFor(() => expect(screen.getByText('All courses')).toBeTruthy())
    const items = screen.getAllByText(/Accountancy|Civil Engineering|Nursing/)
    const texts = items.map((n: any) => n.props.children as string)
    expect(texts).toEqual(['Accountancy (CPA)', 'Civil Engineering', 'Nursing'])
  })
})
