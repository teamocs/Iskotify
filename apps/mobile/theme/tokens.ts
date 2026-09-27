import type { TextStyle } from 'react-native'

// ── Design tokens (Refined Maroon, 2026) ─────────────────────────────────────
// One source of truth for color, type, spacing, radius, elevation. Iskotify has
// ONE palette — this light theme; there is no dark mode and no theme setting
// (guarded by __tests__/lightOnly.test.ts). It is contrast-tuned to WCAG:
// primary text ≥ 7:1, secondary ≥ 4.5:1, tertiary ≥ 3:1. Adding a key here
// propagates to every screen via useTheme().

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
  // `*Strong` — DESIGN.md's "strong" role: text/icons sitting ON that status's
  // own `*Surface` tint (never on a plain surface — use the DEFAULT color there).
  // The tints blend a saturated color at only 10%
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
  // Full-screen media viewer (figure zoom): dark so the image is the only
  // bright thing on screen; controls on it use textInverse.
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
  // Boundary of a form control (text field, search, select). `border` is a
  // decorative hairline and can't show where a field is on its own; this
  // clears WCAG 1.4.11's 3:1 on every ground a field sits on. Maroon-tinted
  // grey so it sits in the warm palette. Measured (WCAG formula):
  //   bg #fdf4f4 3.48 · surface #ffffff 3.76 · surfaceRaised 3.76 · surface2 3.09
  inputBorder:   '#9c7c7c',
}

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

export type Theme      = typeof lightTheme
export type Typography = typeof typography
export type Spacing    = typeof spacing
export type Radius     = typeof radius
