import type { Theme } from '../theme/tokens'

/**
 * Ink for a note that has a paper colour (NOTE_COLORS).
 *
 * Every note colour is a light pastel; screens call `noteInk(t, hasPaper)`.
 *
 * Secondary text on paper uses the primary ink too: textSecondary
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
    text: t.textPrimary,
    sub: t.textPrimary,
    hairline: t.border,
    control: t.textPrimary,
  }
}
