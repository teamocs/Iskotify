/**
 * Help, About and Privacy (redesign M2, Read mode): one level-1 page heading,
 * level-2 section headings a screen reader can jump between, prose in a 720
 * reading column on wide windows, and a named back button.
 */
import React from 'react'
import { StyleSheet } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import HelpScreen from '../help'
import AboutScreen from '../about'
import PrivacyScreen from '../privacy'
import { aria } from '../../test-utils/aria'

const mockBack = jest.fn()
const mockReplace = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  router: {
    back: (...a: unknown[]) => mockBack(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    push: jest.fn(),
    canGoBack: () => mockCanGoBack,
  },
}))

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.2.3' } },
}))

let mockBp: 'compact' | 'medium' | 'expanded' = 'expanded'
jest.mock('../../hooks/useBreakpoint', () => ({
  ...jest.requireActual('../../hooks/useBreakpoint'),
  useBreakpoint: () => mockBp,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockCanGoBack = true
  mockBp = 'expanded'
})

const PAGES = [
  ['Help', HelpScreen, 'Help and support'],
  ['About', AboutScreen, 'About Iskotify'],
  ['Privacy', PrivacyScreen, 'Privacy and terms'],
] as const

describe.each(PAGES)('%s page', (_n, Page, title) => {
  it('has exactly one level-1 heading, the page title', () => {
    render(<Page />)
    const h1s = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 1)
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent(title)
  })

  it('breaks its content into level-2 section headings', () => {
    render(<Page />)
    const h2s = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 2)
    expect(h2s.length).toBeGreaterThanOrEqual(2)
  })

  it('caps the reading column at 720 on wide windows', () => {
    render(<Page />)
    const col = StyleSheet.flatten(screen.getByTestId('screen-content').props.style)
    expect(col.maxWidth).toBe(720)
  })

  it('Back is a named button; with no history it returns to Settings', () => {
    mockCanGoBack = false
    render(<Page />)
    fireEvent.press(screen.getByRole('button', { name: 'Go back' }))
    expect(mockReplace).toHaveBeenCalledWith('/settings')
  })
})

describe('Help copy matches the current app', () => {
  it('uses the four current destinations and no retired features', () => {
    render(<HelpScreen />)
    expect(screen.queryByText(/Change Focus|Export Data|Listings screen|AI Study Feedback|bell icon/)).toBeNull()
  })

  it('shows the support address as text a student can copy', () => {
    render(<HelpScreen />)
    expect(screen.getByText('teamocsph@gmail.com').props.selectable).toBe(true)
  })

  it('questions are disclosures that expose aria-expanded', () => {
    render(<HelpScreen />)
    const q = screen.getByRole('button', { name: 'Can I use Iskotify offline?' })
    expect(aria(q, 'aria-expanded')).toBe(false)
    fireEvent.press(q)
    expect(aria(screen.getByRole('button', { name: 'Can I use Iskotify offline?' }), 'aria-expanded')).toBe(true)
  })
})

describe('About copy', () => {
  it('carries the approved tagline and no retired AI coaching claim', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    expect(screen.queryByText(/AI-enhanced|ultimate|confidently pass/i)).toBeNull()
  })
})
