/**
 * SidebarNav render test.
 *
 * Mocks:
 *  - expo-router (usePathname, router)
 *  - KuyaChatProvider (useKuyaChatModal)
 *  - useWindowDimensions → lg width so useBreakpoint returns 'lg'
 *
 * Default jest dimensions are phone-sized (sm) but here we explicitly mock
 * useWindowDimensions to return a desktop width to verify the sidebar renders
 * its nav items and Kuya Baw entry.
 */
import React from 'react'
import { render } from '@testing-library/react-native'

// Mock expo-router before SidebarNav is imported
jest.mock('expo-router', () => ({
  usePathname: jest.fn(() => '/'),
  router: { push: jest.fn() },
}))

// Mock KuyaChatProvider
jest.mock('../../providers/KuyaChatProvider', () => ({
  useKuyaChatModal: () => ({ open: jest.fn() }),
}))

// Mock useWindowDimensions to return a desktop-width screen
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: 1280, height: 900, scale: 1, fontScale: 1 }),
}))

import { SidebarNav } from '../web/SidebarNav'

describe('SidebarNav', () => {
  it('renders all primary nav items', () => {
    const { getByText } = render(<SidebarNav />)
    expect(getByText('Home')).toBeTruthy()
    expect(getByText('Exams')).toBeTruthy()
    expect(getByText('Lists')).toBeTruthy()
    expect(getByText('Updates')).toBeTruthy()
  })

  it('renders Kuya Baw entry', () => {
    const { getByText } = render(<SidebarNav />)
    expect(getByText('Ask Kuya Baw')).toBeTruthy()
  })

  it('renders bottom nav items (Profile and Settings)', () => {
    const { getByText } = render(<SidebarNav />)
    expect(getByText('Profile')).toBeTruthy()
    expect(getByText('Settings')).toBeTruthy()
  })

  it('renders app name', () => {
    const { getByText } = render(<SidebarNav />)
    expect(getByText('Iskotify')).toBeTruthy()
  })

  it('marks Home as active when pathname is "/"', () => {
    const { usePathname } = require('expo-router')
    ;(usePathname as jest.Mock).mockReturnValue('/')
    const { getAllByRole } = render(<SidebarNav />)
    const buttons = getAllByRole('button')
    // Home button should have accessibilityState selected: true
    const homeBtn = buttons.find(b => b.props.accessibilityLabel === 'Home')
    expect(homeBtn?.props.accessibilityState?.selected).toBe(true)
  })

  it('does not mark Exams as active when pathname is "/"', () => {
    const { usePathname } = require('expo-router')
    ;(usePathname as jest.Mock).mockReturnValue('/')
    const { getAllByRole } = render(<SidebarNav />)
    const buttons = getAllByRole('button')
    const examsBtn = buttons.find(b => b.props.accessibilityLabel === 'Exams')
    expect(examsBtn?.props.accessibilityState?.selected).toBe(false)
  })
})
