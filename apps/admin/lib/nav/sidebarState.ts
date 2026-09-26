/**
 * Sidebar collapse state, its persistence and its keyboard shortcut, as pure
 * functions. The state lives in a cookie (not localStorage) so the server layout
 * can render the rail on the first paint: no expanded-then-collapsed flash on
 * reload. Same approach as shadcn/ui's Sidebar.
 */

export type SidebarMode = 'expanded' | 'collapsed'

export const SIDEBAR_COOKIE = 'admin_sidebar'
const ONE_YEAR_S = 60 * 60 * 24 * 365

export function parseSidebarMode(value: string | null | undefined): SidebarMode {
  return value === 'collapsed' ? 'collapsed' : 'expanded'
}

export function sidebarCookie(mode: SidebarMode): string {
  return `${SIDEBAR_COOKIE}=${mode}; Path=/; Max-Age=${ONE_YEAR_S}; SameSite=Lax`
}

interface KeyLike {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  target: { isContentEditable?: boolean; tagName?: string } | null
}

/**
 * Ctrl+B (Windows/Linux) or Cmd+B (macOS). Shift/Alt variants belong to the
 * browser's bookmark shortcuts. Rich-text editors keep Ctrl+B for bold; a plain
 * input has no bold, so the toggle still works from a search box.
 */
export function isToggleSidebarShortcut(e: KeyLike): boolean {
  if (e.key.toLowerCase() !== 'b') return false
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false
  if (e.target?.isContentEditable) return false
  return true
}

/** The keys to show in the visible hint. */
export function toggleShortcutKeys(isMac: boolean): [string, string] {
  return [isMac ? '⌘' : 'Ctrl', 'B']
}

/** A queue count as badge text: nothing when empty, capped so it never widens the rail. */
export function formatBadgeCount(n: number | undefined): string | null {
  if (!n || n <= 0) return null
  return n > 99 ? '99+' : String(n)
}
