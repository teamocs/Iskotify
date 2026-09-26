import { describe, it, expect } from 'vitest'
import {
  SIDEBAR_COOKIE,
  parseSidebarMode,
  sidebarCookie,
  isToggleSidebarShortcut,
  toggleShortcutKeys,
  formatBadgeCount,
} from '../sidebarState'

describe('collapse persistence', () => {
  it('reads an absent or unknown cookie as expanded (the safe default)', () => {
    expect(parseSidebarMode(undefined)).toBe('expanded')
    expect(parseSidebarMode(null)).toBe('expanded')
    expect(parseSidebarMode('')).toBe('expanded')
    expect(parseSidebarMode('sideways')).toBe('expanded')
  })

  it('reads the persisted values back', () => {
    expect(parseSidebarMode('collapsed')).toBe('collapsed')
    expect(parseSidebarMode('expanded')).toBe('expanded')
  })

  it('writes a site-wide, year-long, lax cookie the server layout can read', () => {
    const c = sidebarCookie('collapsed')
    expect(c.startsWith(`${SIDEBAR_COOKIE}=collapsed;`)).toBe(true)
    expect(c).toContain('Path=/')
    expect(c).toMatch(/Max-Age=31536000/)
    expect(c).toContain('SameSite=Lax')
  })

  it('round-trips: what is written is what is read', () => {
    for (const mode of ['collapsed', 'expanded'] as const) {
      const value = sidebarCookie(mode).split(';')[0]!.split('=')[1]
      expect(parseSidebarMode(value)).toBe(mode)
    }
  })
})

describe('Ctrl/Cmd+B toggles the sidebar', () => {
  const key = (over: Partial<Parameters<typeof isToggleSidebarShortcut>[0]>) =>
    isToggleSidebarShortcut({ key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, target: null, ...over })

  it('fires on Ctrl+B and on Cmd+B, either case', () => {
    expect(key({ ctrlKey: true })).toBe(true)
    expect(key({ metaKey: true })).toBe(true)
    expect(key({ ctrlKey: true, key: 'B' })).toBe(true)
  })

  it('ignores a bare B, and B with Shift or Alt (browser bookmark shortcuts)', () => {
    expect(key({})).toBe(false)
    expect(key({ ctrlKey: true, shiftKey: true })).toBe(false)
    expect(key({ ctrlKey: true, altKey: true })).toBe(false)
  })

  it('ignores other keys', () => {
    expect(key({ ctrlKey: true, key: 'k' })).toBe(false)
  })

  it('leaves Ctrl+B to rich-text editors (bold)', () => {
    expect(key({ ctrlKey: true, target: { isContentEditable: true } })).toBe(false)
    // Plain inputs have no bold, so the toggle still works from a search box.
    expect(key({ ctrlKey: true, target: { tagName: 'INPUT', isContentEditable: false } })).toBe(true)
  })

  it('names the keys per platform for the visible hint', () => {
    expect(toggleShortcutKeys(false)).toEqual(['Ctrl', 'B'])
    expect(toggleShortcutKeys(true)).toEqual(['⌘', 'B'])
  })
})

describe('formatBadgeCount', () => {
  it('shows nothing for an empty queue', () => {
    expect(formatBadgeCount(0)).toBeNull()
    expect(formatBadgeCount(-1)).toBeNull()
    expect(formatBadgeCount(undefined)).toBeNull()
  })

  it('shows the number, capped at 99+', () => {
    expect(formatBadgeCount(7)).toBe('7')
    expect(formatBadgeCount(99)).toBe('99')
    expect(formatBadgeCount(100)).toBe('99+')
  })
})
