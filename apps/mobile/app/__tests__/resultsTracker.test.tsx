import React from 'react'
import { Linking } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import ResultsTrackerScreen from '../results-tracker'

const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const React = require('react')
  return {
    router: { push: (p: string) => mockPush(p), back: jest.fn(), replace: jest.fn(), canGoBack: () => true },
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
  }
})

jest.mock('@lineiconshq/react-native-lineicons', () => ({ Lineicons: () => null }))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

const DAY = 86_400_000
let mockRows: any[] = []
let mockMode: 'ok' | 'pending' | 'failOnce' = 'ok'
let mockCalls = 0
const mockDelete = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }))
jest.mock('../../hooks/useDb', () => {
  const db = {
    select: () => ({
      from: () => ({
        leftJoin: () => {
          mockCalls++
          if (mockMode === 'pending') return new Promise(() => {})
          if (mockMode === 'failOnce' && mockCalls === 1) return Promise.reject(new Error('offline'))
          return Promise.resolve(mockRows)
        },
      }),
    }),
    delete: () => mockDelete(),
  }
  return { useDb: () => db }
})

describe('ResultsTrackerScreen', () => {
  beforeEach(() => {
    mockRows = []
    mockMode = 'ok'
    mockCalls = 0
    mockPush.mockClear()
    mockDelete.mockClear()
  })

  it('has its sentence-case title as the page heading, in the page column, and a labelled back button', () => {
    render(<ResultsTrackerScreen />)
    // Route audit 2026-09-26: the title sat in a 1040-wide top bar while the
    // content used a narrower column. Now it is the page's PageTitle.
    expect(screen.getByRole('header', { name: 'Results tracker' })).toBeTruthy()
    expect(screen.getByTestId('results-title')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeTruthy()
  })

  it('shows a skeleton while loading', () => {
    mockMode = 'pending'
    render(<ResultsTrackerScreen />)
    expect(screen.getByTestId('results-skeleton')).toBeTruthy()
  })

  it('empty: explains, and offers one next step into Explore', async () => {
    render(<ResultsTrackerScreen />)
    expect(await screen.findByText('No results tracked yet')).toBeTruthy()
    fireEvent.press(screen.getByRole('button', { name: 'Find an exam' }))
    expect(mockPush).toHaveBeenCalledWith('/explore?section=universities')
  })

  it('a pending result shows a waiting status and the days to go', async () => {
    mockRows = [{ slug: 'upcat', addedAt: 1, title: 'UPCAT', resultsDate: Date.now() + 12 * DAY, externalUrl: null }]
    render(<ResultsTrackerScreen />)
    expect(await screen.findByText('Waiting for results')).toBeTruthy()
    expect(screen.getByText('12')).toBeTruthy()
    expect(screen.getByText('days to go')).toBeTruthy()
  })

  it('a due result links to the official site', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never)
    mockRows = [{ slug: 'ustet', addedAt: 1, title: 'USTET', resultsDate: Date.now() - 2 * DAY, externalUrl: 'https://ust.edu.ph' }]
    render(<ResultsTrackerScreen />)
    expect(await screen.findByText('Results may be out')).toBeTruthy()
    fireEvent.press(screen.getByRole('link', { name: 'Check USTET results on the official site' }))
    expect(open).toHaveBeenCalledWith('https://ust.edu.ph')
  })

  it('stops tracking with a button named for the exam', async () => {
    mockRows = [{ slug: 'upcat', addedAt: 1, title: 'UPCAT', resultsDate: null, externalUrl: null }]
    render(<ResultsTrackerScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Stop tracking UPCAT' }))
    expect(mockDelete).toHaveBeenCalled()
    expect(await screen.findByText('No results tracked yet')).toBeTruthy()
  })

  it('a failed load offers a retry', async () => {
    mockMode = 'failOnce'
    mockRows = [{ slug: 'upcat', addedAt: 1, title: 'UPCAT', resultsDate: null, externalUrl: null }]
    render(<ResultsTrackerScreen />)
    fireEvent.press(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('UPCAT')).toBeTruthy()
  })
})
