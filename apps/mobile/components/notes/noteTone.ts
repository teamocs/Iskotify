import type { Theme } from '../../theme/tokens'
import type { NoteColor } from '../../hooks/useNotes'

/**
 * Note "paper" colours, drawn from theme tokens.
 *
 * Notes store a colour KEY (`notes.color`: 'red', 'yellow', … or null) — the
 * data is unchanged. At render time each stored key maps onto one of six
 * theme surfaces, so a note reads correctly in light and dark mode and no
 * screen paints a hard-coded pastel. Legacy keys from the old eleven-colour
 * palette fold onto the nearest tone (orange → amber, cyan → maroon, …).
 */
export type NoteTone = 'plain' | 'soft' | 'maroon' | 'green' | 'amber' | 'red'

const TONE_OF_KEY: Record<string, NoteTone> = {
  gray: 'soft',
  purple: 'maroon',
  blue: 'maroon',
  cyan: 'maroon',
  cerulean: 'maroon',
  green: 'green',
  teal: 'green',
  yellow: 'amber',
  orange: 'amber',
  red: 'red',
  pink: 'red',
}

export function noteTone(color: NoteColor | string | null | undefined): NoteTone {
  if (!color) return 'plain'
  return TONE_OF_KEY[color] ?? 'plain'
}

/** The swatches offered in the editor, and the key each one writes. */
export const NOTE_SWATCHES: readonly { tone: NoteTone; key: NoteColor; name: string }[] = [
  { tone: 'plain', key: null, name: 'Plain' },
  { tone: 'soft', key: 'gray', name: 'Soft' },
  { tone: 'maroon', key: 'purple', name: 'Maroon' },
  { tone: 'green', key: 'green', name: 'Green' },
  { tone: 'amber', key: 'yellow', name: 'Amber' },
  { tone: 'red', key: 'red', name: 'Red' },
]

/** Background for a note of this colour. Text on it is the theme's normal ink. */
export function noteSurface(t: Theme, color: NoteColor | string | null | undefined): string {
  switch (noteTone(color)) {
    case 'soft': return t.surface2
    case 'maroon': return t.accentSurface
    case 'green': return t.successSurface
    case 'amber': return t.warningSurface
    case 'red': return t.dangerSurface
    default: return t.surface
  }
}

/** Swatch outline, so tinted swatches stay visible (≥3:1) on any ground. */
export function noteSwatchBorder(t: Theme, color: NoteColor | string | null | undefined): string {
  switch (noteTone(color)) {
    case 'maroon': return t.accentBorder
    case 'green': return t.successBorder
    case 'amber': return t.warningBorder
    case 'red': return t.dangerBorder
    default: return t.inputBorder
  }
}
