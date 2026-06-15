// Deterministic, theme-independent color identity for a subject.
//   accent — solid hue for dots / labels / accents
//   fill   — low-alpha tint for progress fills; text (token colors) stays readable over it
// The same subject id always maps to the same entry (no per-subject storage needed).

export interface SubjectColor {
  accent: string
  fill: string
}

// Distinct hues that read on both light and dark surfaces. The fill alpha is kept
// low enough that t.textPrimary/textSecondary keep their contrast on top of it.
export const SUBJECT_PALETTE: readonly SubjectColor[] = [
  { accent: '#6366f1', fill: 'rgba(99,102,241,0.22)' },   // indigo
  { accent: '#0ea5e9', fill: 'rgba(14,165,233,0.22)' },   // sky
  { accent: '#10b981', fill: 'rgba(16,185,129,0.22)' },   // emerald
  { accent: '#f59e0b', fill: 'rgba(245,158,11,0.22)' },   // amber
  { accent: '#ec4899', fill: 'rgba(236,72,153,0.22)' },   // pink
  { accent: '#8b5cf6', fill: 'rgba(139,92,246,0.22)' },   // violet
  { accent: '#14b8a6', fill: 'rgba(20,184,166,0.22)' },   // teal
  { accent: '#fb7185', fill: 'rgba(251,113,133,0.22)' },  // rose
] as const

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

/** Stable color identity for a subject id (falls back to the first hue for empty ids). */
export function subjectColor(id: string): SubjectColor {
  if (!id) return SUBJECT_PALETTE[0]!
  return SUBJECT_PALETTE[hashStr(id) % SUBJECT_PALETTE.length]!
}
