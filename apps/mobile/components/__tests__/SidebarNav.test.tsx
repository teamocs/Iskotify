/**
 * SidebarNav (desktop web, expanded ≥ 1024) — the same four destinations as
 * the bottom bar, as links inside a navigation landmark with aria-current,
 * plus Profile (avatar) and Settings at the bottom.
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  usePathname: jest.fn(() => '/'),
  router: { push: jest.fn() },
}))

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ width: 1280, height: 900, scale: 1, fontScale: 1 }),
}))

jest.mock('../../hooks/useProfileName', () => ({
  useProfileName: () => 'Ana Reyes',
}))

import { SidebarNav } from '../web/SidebarNav'

const link = (name: string) => screen.getByRole('link', { name })

describe('SidebarNav', () => {
  beforeEach(() => {
    const { usePathname, router } = require('expo-router')
    ;(usePathname as jest.Mock).mockReturnValue('/')
    ;(router.push as jest.Mock).mockClear()
  })

  it('renders the four destinations as links, in order', () => {
    render(<SidebarNav />)
    const names = screen.getAllByRole('link').map(l => l.props.accessibilityLabel)
    expect(names.slice(0, 4)).toEqual(['Today', 'Practice', 'Explore', 'Progress'])
  })

  it('no longer lists Home / Exams / Lists / Updates', () => {
    render(<SidebarNav />)
    for (const old of ['Home', 'Exams', 'Lists', 'Updates']) expect(screen.queryByText(old)).toBeNull()
  })

  it('is a navigation landmark', () => {
    render(<SidebarNav />)
    expect(screen.getByTestId('sidebar-nav').props.role).toBe('navigation')
  })

  it('marks the current destination with aria-current="page" (and selected for native AT)', () => {
    render(<SidebarNav />)
    expect(link('Today').props['aria-current']).toBe('page')
    expect(link('Today').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }))
    expect(link('Practice').props['aria-current']).toBeUndefined()
  })

  it('treats legacy /updates as Explore', () => {
    const { usePathname } = require('expo-router')
    ;(usePathname as jest.Mock).mockReturnValue('/updates')
    render(<SidebarNav />)
    expect(link('Explore').props['aria-current']).toBe('page')
  })

  it('navigates on press', () => {
    const { router } = require('expo-router')
    render(<SidebarNav />)
    fireEvent.press(link('Explore'))
    expect(router.push).toHaveBeenCalledWith('/explore')
  })

  it('reaches Profile from the avatar row and Settings from the footer', () => {
    const { router } = require('expo-router')
    render(<SidebarNav />)
    fireEvent.press(link('Profile'))
    expect(router.push).toHaveBeenCalledWith('/profile')
    expect(screen.getByText('Ana Reyes')).toBeTruthy()
    fireEvent.press(link('Settings'))
    expect(router.push).toHaveBeenCalledWith('/settings')
  })

  it('renders the app name', () => {
    render(<SidebarNav />)
    expect(screen.getByText('Iskotify')).toBeTruthy()
  })
})
