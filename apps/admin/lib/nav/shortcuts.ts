import { GO_SHORTCUTS } from './adminNav'

/**
 * Keyboard shortcut resolution as a pure state machine, so the timing and
 * sequencing rules are testable without a DOM. The React side only feeds keys in
 * and performs the returned action.
 */

export type ShortcutAction =
  | { type: 'navigate'; href: string }
  | { type: 'focus-search' }
  | { type: 'show-help' }

export interface ShortcutState { pendingSince: number | null }

export const INITIAL_SHORTCUT_STATE: ShortcutState = { pendingSince: null }

/** How long "g" waits for its second key. */
export const SEQUENCE_TIMEOUT_MS = 1500

/** `chord`: keys held together (Ctrl+B). Otherwise keys are pressed in sequence (g then h). */
export const SHORTCUT_LIST: { keys: string[]; label: string; chord?: boolean }[] = [
  { keys: ['g', 'h'], label: `Go to ${GO_SHORTCUTS.h.label}` },
  { keys: ['g', 'c'], label: `Go to ${GO_SHORTCUTS.c.label}` },
  { keys: ['g', 'i'], label: `Go to ${GO_SHORTCUTS.i.label}` },
  { keys: ['/'], label: 'Focus search' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
  // Handled by AdminShell, not resolveShortcut: it is a modifier chord, and the
  // sequence listener ignores every Ctrl/Cmd chord by design.
  { keys: ['Ctrl', 'B'], label: 'Collapse or expand the sidebar', chord: true },
]

export function resolveShortcut(
  state: ShortcutState,
  key: string,
  now: number,
): { state: ShortcutState; action: ShortcutAction | null } {
  const armed = state.pendingSince !== null && now - state.pendingSince <= SEQUENCE_TIMEOUT_MS
  if (armed) {
    const target = GO_SHORTCUTS[key as keyof typeof GO_SHORTCUTS]
    return { state: INITIAL_SHORTCUT_STATE, action: target ? { type: 'navigate', href: target.href } : null }
  }
  if (key === 'g') return { state: { pendingSince: now }, action: null }
  if (key === '/') return { state: INITIAL_SHORTCUT_STATE, action: { type: 'focus-search' } }
  if (key === '?') return { state: INITIAL_SHORTCUT_STATE, action: { type: 'show-help' } }
  return { state: INITIAL_SHORTCUT_STATE, action: null }
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'])

/** Shortcuts must never steal keys while someone is typing. */
export function isTypingTarget(el: { tagName?: string; type?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = (el.tagName ?? '').toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has((el.type ?? 'text').toLowerCase())
  return false
}
