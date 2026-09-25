import { Platform, type ViewStyle } from 'react-native'

/**
 * Spread on a purely decorative wrapper (icon, initials, grabber, backdrop).
 * The first two props hide it from TalkBack / VoiceOver; react-native-web
 * ignores both, so `aria-hidden` does the same job in the web build.
 */
export const decorative = {
  importantForAccessibility: 'no-hide-descendants',
  accessibilityElementsHidden: true,
  'aria-hidden': true,
} as const

// ── Keyboard focus ring (web) ────────────────────────────────────────────────
// react-native-web's Pressable reports `focused` for every focus, including
// the one a mouse click causes. Track the last input modality so the ring only
// shows for keyboard focus (the :focus-visible heuristic). Starts as keyboard
// so programmatic focus before any input still shows where focus is.
let keyboardModality = true

export function setInputModality(kind: 'keyboard' | 'pointer'): void {
  keyboardModality = kind === 'keyboard'
}

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!e.metaKey && !e.ctrlKey && !e.altKey) setInputModality('keyboard')
  }, true)
  const pointer = () => setInputModality('pointer')
  document.addEventListener('pointerdown', pointer, true)
  document.addEventListener('mousedown', pointer, true)
  document.addEventListener('touchstart', pointer, true)
}

/**
 * Outline for a Pressable's style function: `focusRing(t.focusRing, focused)`.
 * Only react-native-web passes `focused`, so native is never affected.
 */
export function focusRing(color: string, focused: boolean | undefined): ViewStyle | null {
  if (!focused || !keyboardModality) return null
  return { outlineColor: color, outlineStyle: 'solid', outlineWidth: 2, outlineOffset: 2 }
}

/** Pressable style-function state, including the web-only fields RN's types omit. */
export type WebPressableState = { pressed: boolean; hovered?: boolean; focused?: boolean }
