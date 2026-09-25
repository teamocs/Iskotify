import { lightTheme, type Theme } from '../theme/tokens'

/**
 * Ink for a note that has a paper colour (NOTE_COLORS).
 *
 * Every note colour is a light pastel, in BOTH app themes, so the ink on it
 * must be the light theme's ink even when the app is dark — otherwise dark
 * mode puts white text on pale yellow. This is the one sanctioned place that
 * reads `lightTheme` directly; screens call `noteInk(t, hasPaper)`.
 *
 * Secondary text on paper uses the primary ink too: lightTheme.textSecondary
 * measures only ~4:1 on the red/orange papers, so de-emphasis on paper comes
 * from size and weight, not a lighter colour (DESIGN.md: no lighter step).
 */
export interface NoteInk {
  text: string
  sub: string
  /** Hairline (decorative) on paper. */
  hairline: string
  /** Control boundaries (checkboxes, swatches): ≥3:1 on every paper colour. */
  control: string
}

export function noteInk(t: Theme, hasPaper: boolean): NoteInk {
  if (!hasPaper) {
    return { text: t.textPrimary, sub: t.textSecondary, hairline: t.border, control: t.textTertiary }
  }
  return {
    text: lightTheme.textPrimary,
    sub: lightTheme.textPrimary,
    hairline: lightTheme.border,
    control: lightTheme.textPrimary,
  }
}
