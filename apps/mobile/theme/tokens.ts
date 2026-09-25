import type { TextStyle } from 'react-native'

// ── Design tokens (Refined Maroon, 2026) ─────────────────────────────────────
// One source of truth for color, type, spacing, radius, elevation. Both themes are
// contrast-tuned to WCAG: primary text ≥ 7:1, secondary ≥ 4.5:1, tertiary ≥ 3:1.
// Adding a key here propagates to every screen via useTheme(); both theme objects
// MUST keep identical keys (Theme = typeof darkTheme).

export const darkTheme = {
  bg:            '#1a1a2e',
  surface:       'rgba(255,255,255,0.08)',
  surface2:      'rgba(255,255,255,0.14)',
  border:        'rgba(255,255,255,0.14)',
  textPrimary:   '#ffffff',
  textSecondary: 'rgba(255,255,255,0.72)',  // was 0.62 → ~5.5:1
  textTertiary:  'rgba(255,255,255,0.52)',  // was 0.38 (≈2:1, failed) → ≈5.47:1 on bg (4.87:1 on surfaceRaised)
  accent:        '#800000',
  accentText:    '#fca5a5',
  accentSurface: 'rgba(128,0,0,0.22)',
  accentStrong:  'rgba(128,0,0,0.82)',     // opaque maroon for filled pills, badges, active tabs
  textInverse:   '#ffffff',                // text/icons on the maroon accent (maroon is dark in both themes)
  // Semantic status colors — theme-tuned so greens/reds stay legible in dark mode.
  success:       '#4ade80',
  successSurface:'rgba(74,222,128,0.16)',
  danger:        '#f87171',
  dangerSurface: 'rgba(248,113,113,0.16)',
  warning:       '#fbbf24',
  warningSurface:'rgba(251,191,36,0.16)',
  // `*Strong` — DESIGN.md's "strong" role: text/icons sitting ON that status's
  // own `*Surface` tint (never on a plain surface — use the DEFAULT color there).
  // Dark theme's tints blend a light/saturated status color over a DARK bg
  // (#1a1a2e), so the blended tint stays dark — the DEFAULT color already
  // clears 4.5:1 against it, measured here (relative-luminance, WCAG formula):
  //   successStrong #4ade80 on successSurface-over-bg (~#22393B): 7.02:1
  //   dangerStrong  #f87171 on dangerSurface-over-bg  (~#3E2839): 4.84:1
  //   warningStrong #fbbf24 on warningSurface-over-bg (~#3E342C): 7.26:1
  // (This is the light-theme-only bug DESIGN.md's audit found: a *fill* of
  // raw `warning` behind white text is still ~1.7:1 — that's fixed by using
  // `accentStrong` as the fill instead, not by this token.)
  successStrong: '#4ade80',
  dangerStrong:  '#f87171',
  warningStrong: '#fbbf24',
  // Opaque (was 0.92): scrolled content showed through behind tab labels.
  tabBar:        '#1a1a2e',
  divider:       'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.05)',
  // Elevation — boxShadow strings (new-arch, cross-platform). Dark uses deeper black.
  shadowSm:      '0px 1px 3px rgba(0,0,0,0.40)',
  shadowMd:      '0px 6px 18px rgba(0,0,0,0.48)',
  // Full-screen media viewer (figure zoom). Dark in both themes so the image is
  // the only bright thing on screen; controls on it use textInverse.
  scrim:         'rgba(0,0,0,0.92)',
  scrimControl:  'rgba(255,255,255,0.15)',
  // ── Redesign M1 (direction C) additions ─────────────────────────────────
  // Status/accent BORDERS: alpha tuned so each clears 3:1 (WCAG 1.4.11
  // non-text contrast) against BOTH bg #1a1a2e and surface-over-bg (~#2c2c3f),
  // so a border can carry a state boundary (selected chip, error field) on its
  // own. Measured (WCAG relative luminance):
  //   successBorder 3.82 / 3.40 · dangerBorder 3.65 / 3.13
  //   warningBorder 3.48 / 3.15 · accentBorder 3.62 / 3.23
  successBorder: 'rgba(74,222,128,0.55)',
  dangerBorder:  'rgba(248,113,113,0.70)',
  warningBorder: 'rgba(251,191,36,0.50)',
  accentBorder:  'rgba(252,165,165,0.55)',
  // Pressed fill for the one maroon primary action. White on it: 14.43:1.
  accentPressed: '#5c0000',
  // Opaque raised surface for sheets/dialogs (= surface blended over bg).
  // textPrimary 13.64 · textSecondary 7.85 · textTertiary 4.87 · accentText 7.19.
  surfaceRaised: '#2c2c3f',
  // Dimmed layer behind sheets/dialogs (not the media scrim above).
  backdrop:      'rgba(0,0,0,0.60)',
  // Keyboard focus ring: 8.99:1 on bg.
  focusRing:     '#fca5a5',
  // ── Redesign M2 addition ────────────────────────────────────────────────
  // Boundary of a form control (text field, search, select). `border` is a
  // decorative hairline (~1.3:1) and cannot show where a field is on its own;
  // this clears WCAG 1.4.11's 3:1 on every ground a field sits on. Opaque, so
  // it measures the same over a translucent surface. Measured (WCAG formula):
  //   bg #1a1a2e 5.06 · surface-over-bg 4.04 · surfaceRaised 4.04 · surface2 3.30
  inputBorder:   '#8a8aa0',
}

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.06)',
  border:        'rgba(128,0,0,0.14)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#6b3737',
  textTertiary:  'rgba(45,10,10,0.62)',     // 0.52 → 0.58 → 0.62; measured 5.09:1 on #fdf4f4 and #ffffff
  accent:        '#800000',
  accentText:    '#9b1c1c',
  accentSurface: 'rgba(128,0,0,0.10)',
  accentStrong:  'rgba(128,0,0,0.82)',     // opaque maroon for filled pills, badges, active tabs
  textInverse:   '#ffffff',                // text/icons on the maroon accent
  // Semantic status colors — darker on the light palette so they meet contrast on white.
  success:       '#15803d',                // was #16a34a: 3.05:1, failed AA on both light surfaces → 4.64:1
  successSurface:'rgba(21,128,61,0.10)',
  danger:        '#b91c1c',                // was #dc2626: 4.47:1, just under AA → 5.98:1
  dangerSurface: 'rgba(185,28,28,0.10)',
  warning:       '#b45309',
  warningSurface:'rgba(180,83,9,0.10)',
  // `*Strong` — text/icons on that status's OWN tint (see darkTheme's comment
  // for the role). Light theme's tints blend a saturated color at only 10%
  // over a near-white bg, so the DEFAULT color falls short here — each is
  // darkened until it clears 4.5:1 against its own blended *Surface tint
  // (measured, WCAG relative-luminance formula; mirrors the web preset's
  // `-strong` shades in DESIGN.md):
  //   successStrong #166534 on successSurface-over-bg (~#E6E8E2): 5.77:1
  //   dangerStrong  #991b1b on dangerSurface-over-bg  (~#F6DEDE): 6.50:1
  //   warningStrong #92400e on warningSurface-over-bg (~#F6E4DD): 5.74:1
  // (The base `warning` #b45309 measures only ~4.08:1 here — under AA.)
  successStrong: '#166534',
  dangerStrong:  '#991b1b',
  warningStrong: '#92400e',
  // Opaque (was 0.92): scrolled content showed through behind tab labels.
  tabBar:        '#fdf4f4',
  divider:       'rgba(128,0,0,0.14)',
  surfaceSubtle: 'rgba(128,0,0,0.05)',
  // Elevation — soft maroon-tinted shadows for the warm light palette.
  shadowSm:      '0px 1px 3px rgba(128,0,0,0.08)',
  shadowMd:      '0px 8px 24px rgba(128,0,0,0.12)',
  scrim:         'rgba(0,0,0,0.92)',
  scrimControl:  'rgba(255,255,255,0.15)',
  // ── Redesign M1 (direction C) additions ─────────────────────────────────
  // Borders clear 3:1 (WCAG 1.4.11) against BOTH #fdf4f4 and #ffffff:
  //   successBorder 3.32 / 3.49 · dangerBorder 3.31 / 3.46
  //   warningBorder 3.33 / 3.53 · accentBorder 3.10 / 3.18
  successBorder: 'rgba(21,128,61,0.80)',
  dangerBorder:  'rgba(185,28,28,0.65)',
  warningBorder: 'rgba(180,83,9,0.80)',
  accentBorder:  'rgba(128,0,0,0.50)',
  // Pressed fill for the maroon primary action. White on it: 14.43:1.
  accentPressed: '#5c0000',
  // Sheets/dialogs sit on plain white (all text tokens measured on #ffffff).
  surfaceRaised: '#ffffff',
  backdrop:      'rgba(45,10,10,0.40)',
  // Keyboard focus ring: 10.13:1 on bg.
  focusRing:     '#800000',
  // Form-control boundary (see darkTheme). Maroon-tinted grey so it sits in
  // the warm palette. Measured (WCAG formula):
  //   bg #fdf4f4 3.48 · surface #ffffff 3.76 · surfaceRaised 3.76 · surface2 3.09
  inputBorder:   '#9c7c7c',
}

export const statusColors = {
  strong: '#4ade80',
  weak:   '#f87171',
  review: '#fbbf24',
} as const

// Type scale (min 12 for readability — no body/label below 12pt).
export const typography = {
  xs:      12,   // was 11 (below the readable minimum)
  sm:      13,
  base:    16,
  md:      17,
  lg:      20,
  xl:      22,
  h3:      26,
  h2:      30,
  h1:      36,
  display: 48,
} as const

// Font families (loaded in app/_layout.tsx). Outfit for headings, numbers and
// button labels; Lexend for reading text and small labels.
export const fonts = {
  heading:     'Outfit_700Bold',
  headingSemi: 'Outfit_600SemiBold',
  headingReg:  'Outfit_400Regular',
  body:        'Lexend_400Regular',
  bodyMedium:  'Lexend_500Medium',
  bodySemi:    'Lexend_600SemiBold',
} as const

type TextRole = {
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing?: number
  fontVariant?: TextStyle['fontVariant']
}

/**
 * Type roles (direction C: big tabular numbers for timers/scores/countdowns,
 * everything else quieter). Sizes come only from `typography`; nothing below
 * 12; tracking never tighter than -0.04em. Use via `textStyle(role, color)`
 * instead of hand-picking a fontSize per screen.
 */
export const textStyles = {
  display:   { fontFamily: fonts.heading,     fontSize: typography.display, lineHeight: 54, letterSpacing: -1 },
  title:     { fontFamily: fonts.heading,     fontSize: typography.h3,      lineHeight: 32, letterSpacing: -0.5 },
  headline:  { fontFamily: fonts.heading,     fontSize: typography.lg,      lineHeight: 26, letterSpacing: -0.2 },
  titleSm:   { fontFamily: fonts.headingSemi, fontSize: typography.md,      lineHeight: 22 },
  body:      { fontFamily: fonts.body,        fontSize: typography.base,    lineHeight: 24 },
  bodySm:    { fontFamily: fonts.body,        fontSize: typography.sm,      lineHeight: 19 },
  label:     { fontFamily: fonts.bodySemi,    fontSize: typography.sm,      lineHeight: 18 },
  button:    { fontFamily: fonts.heading,     fontSize: typography.base,    lineHeight: 20, letterSpacing: 0.1 },
  caption:   { fontFamily: fonts.body,        fontSize: typography.xs,      lineHeight: 16 },
  numeric:   { fontFamily: fonts.heading,     fontSize: typography.xl,      lineHeight: 28, fontVariant: ['tabular-nums'] },
  numericLg: { fontFamily: fonts.heading,     fontSize: typography.h1,      lineHeight: 42, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, TextRole>

export type TextStyleRole = keyof typeof textStyles

/** A type role as a TextStyle, optionally with a colour (pass a theme token). */
export function textStyle(role: TextStyleRole, color?: string): TextStyle {
  const base = textStyles[role] as TextStyle
  return color ? { ...base, color } : { ...base }
}

// 4/8 spacing rhythm.
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const

// Corner radii (use with { borderCurve: 'continuous' } except pill/capsule).
export const radius = {
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  xxl:  28,
  pill: 999,
} as const

// Layout constants. The bottom tab bar is a flat absolute bar of `tabBarHeight`
// plus the device's bottom safe-area inset; screens should reserve
// `tabBarHeight + content gap` ABOVE the safe-area inset to avoid overlap.
// Use at call sites as: paddingBottom: insets.bottom + layout.tabBarClearance.
export const layout = {
  tabBarHeight:    64,
  tabBarClearance: 80,  // tabBarHeight + 16 gap (add insets.bottom at the call site)
} as const

export type Theme      = typeof darkTheme
export type Typography = typeof typography
export type Spacing    = typeof spacing
export type Radius     = typeof radius
