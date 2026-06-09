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
  textTertiary:  'rgba(255,255,255,0.52)',  // was 0.38 (≈2:1, failed) → ~3.4:1
  accent:        '#800000',
  accentText:    '#fca5a5',
  accentSurface: 'rgba(128,0,0,0.22)',
  tabBar:        'rgba(26,26,46,0.92)',
  divider:       'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.05)',
  // Elevation — boxShadow strings (new-arch, cross-platform). Dark uses deeper black.
  shadowSm:      '0px 1px 3px rgba(0,0,0,0.40)',
  shadowMd:      '0px 6px 18px rgba(0,0,0,0.48)',
}

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.06)',
  border:        'rgba(128,0,0,0.14)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#6b3737',
  textTertiary:  'rgba(45,10,10,0.58)',     // was 0.52 → ~4.5:1
  accent:        '#800000',
  accentText:    '#9b1c1c',
  accentSurface: 'rgba(128,0,0,0.10)',
  tabBar:        'rgba(253,244,244,0.92)',
  divider:       'rgba(128,0,0,0.14)',
  surfaceSubtle: 'rgba(128,0,0,0.05)',
  // Elevation — soft maroon-tinted shadows for the warm light palette.
  shadowSm:      '0px 1px 3px rgba(128,0,0,0.08)',
  shadowMd:      '0px 8px 24px rgba(128,0,0,0.12)',
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
  tabBarHeight:    62,
  tabBarClearance: 78,  // tabBarHeight + 16 gap (add insets.bottom at the call site)
} as const

export type Theme      = typeof darkTheme
export type Typography = typeof typography
export type Spacing    = typeof spacing
export type Radius     = typeof radius
