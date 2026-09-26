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
import TermsScreen from '../terms'
import { aria } from '../../test-utils/aria'
import { PRIVACY_LAST_UPDATED, PRIVACY_SECTIONS } from '@iskotify/utils/privacy-policy'
import { TERMS_LAST_UPDATED, TERMS_SECTIONS } from '@iskotify/utils/terms-of-service'

const mockBack = jest.fn()
const mockReplace = jest.fn()
const mockPush = jest.fn()
let mockCanGoBack = true
jest.mock('expo-router', () => ({
  router: {
    back: (...a: unknown[]) => mockBack(...a),
    replace: (...a: unknown[]) => mockReplace(...a),
    push: (...a: unknown[]) => mockPush(...a),
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
  ['Privacy', PrivacyScreen, 'Privacy policy'],
  ['Terms', TermsScreen, 'Terms of service'],
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

describe('Help: the tour comes first', () => {
  it('offers "Take the tour" before any question, and opens the tour as a replay from Help', () => {
    render(<HelpScreen />)
    const buttons = screen.getAllByRole('button')
    const tourIdx = buttons.findIndex(b => /Take the tour/.test(String(b.props.accessibilityLabel ?? '')))
    const firstQuestion = buttons.findIndex(b => b.props.accessibilityLabel === 'Can I use Iskotify offline?')
    expect(tourIdx).toBeGreaterThanOrEqual(0)
    expect(tourIdx).toBeLessThan(firstQuestion)
    fireEvent.press(buttons[tourIdx]!)
    expect(mockPush).toHaveBeenCalledWith('/tour?from=help')
  })
})

describe('Help: task-based sections', () => {
  it('groups questions under getting started, practice and mocks, offline use, and account and sync', () => {
    render(<HelpScreen />)
    const h2 = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 2).map(h => String(h.props.children))
    for (const title of ['Getting started', 'Practice and mock exams', 'Offline use', 'Account and sync']) {
      expect(h2).toContain(title)
    }
  })

  it('answers what happens to a mock exam when the student leaves it', () => {
    render(<HelpScreen />)
    const q = screen.getByRole('button', { name: /leave a mock exam/i })
    fireEvent.press(q)
    expect(screen.getByText(/Resume where you left off/)).toBeTruthy()
  })

  it('keeps the Estimated Admission Score honest (an estimate, historical cutoffs, no promise)', () => {
    render(<HelpScreen />)
    fireEvent.press(screen.getByRole('button', { name: /Estimated Admission Score/ }))
    expect(screen.getByText(/historical cutoffs/)).toBeTruthy()
    expect(screen.queryByText(/will qualify|your UPG is/i)).toBeNull()
  })
})

describe('Privacy copy (shared with the website via @iskotify/utils/privacy-policy)', () => {
  const allText = () => JSON.stringify(screen.toJSON())

  it('renders every shared section heading, after "The short version"', () => {
    render(<PrivacyScreen />)
    const h2 = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 2).map(h => String(h.props.children))
    expect(h2).toEqual(['The short version', ...PRIVACY_SECTIONS.map(s => s.title)])
  })

  it('shows the same "last updated" date as the website', () => {
    render(<PrivacyScreen />)
    expect(screen.getByText(`Privacy policy. Last updated: ${PRIVACY_LAST_UPDATED}`)).toBeTruthy()
    expect(PRIVACY_LAST_UPDATED).toBe('September 26, 2026')
  })

  it('drops the retired AI Coach and the Export-Data-in-Settings claim', () => {
    render(<PrivacyScreen />)
    expect(screen.queryByText(/AI Coach/)).toBeNull()
    expect(screen.queryByText(/Export Data (feature )?in Settings/)).toBeNull()
    expect(allText()).not.toMatch(/encrypted SQLite/)
  })

  it('names the National Privacy Commission and shows the contact address as copyable text', () => {
    render(<PrivacyScreen />)
    expect(allText()).toMatch(/National Privacy Commission at privacy\.gov\.ph/)
    expect(screen.getByText('teamocsph@gmail.com').props.selectable).toBe(true)
  })
})

describe('Terms copy (shared with the website via @iskotify/utils/terms-of-service)', () => {
  const allText = () => JSON.stringify(screen.toJSON())

  it('renders every shared section heading, after "The short version"', () => {
    render(<TermsScreen />)
    const h2 = screen.getAllByRole('header').filter(h => aria(h, 'aria-level') === 2).map(h => String(h.props.children))
    expect(h2).toEqual(['The short version', ...TERMS_SECTIONS.map(s => s.title)])
  })

  it('shows the same "last updated" date as the website', () => {
    render(<TermsScreen />)
    expect(screen.getByText(`Last updated: ${TERMS_LAST_UPDATED}`)).toBeTruthy()
    expect(TERMS_LAST_UPDATED).toBe('September 26, 2026')
  })

  it('names Online Creative Solutions and never mentions Calendar sync, payments rules or continued use', () => {
    render(<TermsScreen />)
    expect(allText()).toMatch(/Online Creative Solutions/)
    expect(allText()).not.toMatch(/Google Calendar|non-refundable|continued use/i)
  })

  it('opens the privacy policy from its in-text link', () => {
    render(<TermsScreen />)
    // Named in "Students under 18", "Your content" and "Your privacy": each one is a link.
    const links = screen.getAllByRole('link', { name: 'Privacy Policy' })
    expect(links.length).toBeGreaterThanOrEqual(3)
    for (const link of links) fireEvent.press(link)
    expect(mockPush).toHaveBeenCalledTimes(links.length)
    expect(mockPush).toHaveBeenCalledWith('/privacy')
  })

  it('shows the contact address as copyable text', () => {
    render(<TermsScreen />)
    expect(screen.getByText('teamocsph@gmail.com').props.selectable).toBe(true)
  })
})

describe('About copy', () => {
  it('carries the approved tagline and no retired AI coaching claim', () => {
    render(<AboutScreen />)
    expect(screen.getByText('Para sa mga Iskolar ng Bayan')).toBeTruthy()
    expect(screen.queryByText(/AI-enhanced|ultimate|confidently pass/i)).toBeNull()
  })
})
