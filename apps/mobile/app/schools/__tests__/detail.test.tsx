import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import SchoolProfileScreen from '../[slug]'

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(() => ({ slug: 'up-diliman' })),
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('../../../components/ui/ScreenScroll', () => ({
  ScreenScroll: ({ children }: any) => children,
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
  coursesOffered: '[]', scholarshipsOffered: '[]', requirements: '["Form 138"]', qualifications: '[]',
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

describe('SchoolProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    failFirst = false
    mockFocus.inFocus = false
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(SCHOOL, PROFILE))
  })

  it('shows a back button and a skeleton first', () => {
    render(<SchoolProfileScreen />)
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
    expect(screen.getByTestId('school-skeleton')).toBeTruthy()
  })

  it('titles the page with the school name as its header', async () => {
    render(<SchoolProfileScreen />)
    expect(await screen.findByRole('header', { name: 'University of the Philippines Diliman' })).toBeTruthy()
  })

  it('leads with the entrance exam and its dates, before accreditation', async () => {
    render(<SchoolProfileScreen />)
    await screen.findByTestId('school-key-facts')
    const order = JSON.stringify(screen.toJSON())
    expect(order.indexOf('October')).toBeGreaterThan(-1)
    expect(order.indexOf('June – August')).toBeLessThan(order.indexOf('AUN-QA'))
  })

  it('primary action opens the exam; save adds it to Focus', async () => {
    const { router } = require('expo-router')
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'View exam and practise' }))
    expect(router.push).toHaveBeenCalledWith('/listings/upcat')
    fireEvent.press(screen.getByRole('button', { name: 'Add to Focus' }))
    expect(mockFocus.addListing).toHaveBeenCalledWith('upcat')
  })

  // Bug (route audit 2026-09-26): a school whose type text is itself "SUC"
  // showed two identical "SUC" badges (the type, then the isSuc flag).
  it('never shows the same badge twice when the type already says SUC', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb({ ...SCHOOL, type: 'SUC' }, PROFILE))
    render(<SchoolProfileScreen />)
    await screen.findByRole('header', { name: 'University of the Philippines Diliman' })
    expect(screen.getAllByText('SUC')).toHaveLength(1)
  })

  it('names difficulty in words, not dots alone', async () => {
    render(<SchoolProfileScreen />)
    expect(await screen.findByLabelText('Difficulty: 4 of 5')).toBeTruthy()
  })

  it('external links are links', async () => {
    render(<SchoolProfileScreen />)
    expect(await screen.findByRole('link', { name: 'Official website, opens in your browser' })).toBeTruthy()
  })

  it('a missing school leads back to Explore', async () => {
    const { useDb } = require('../../../hooks/useDb')
    useDb.mockReturnValue(makeDb(null, null))
    const { router } = require('expo-router')
    render(<SchoolProfileScreen />)
    expect(await screen.findByText("We couldn't find this school")).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Back to Explore' }))
    expect(router.replace).toHaveBeenCalledWith('/explore')
  })

  it('a failed load offers a retry', async () => {
    failFirst = true
    render(<SchoolProfileScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByTestId('school-key-facts')).toBeTruthy()
  })
})
