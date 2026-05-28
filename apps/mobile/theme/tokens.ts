export const darkTheme = {
  bg:            '#1a1a2e',
  surface:       'rgba(255,255,255,0.07)',
  surface2:      'rgba(255,255,255,0.12)',
  border:        'rgba(255,255,255,0.12)',
  textPrimary:   '#ffffff',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary:  'rgba(255,255,255,0.38)',
  accent:        '#800000',
  accentText:    '#fca5a5',
  accentSurface: 'rgba(128,0,0,0.18)',
  tabBar:        'rgba(26,26,46,0.92)',
  divider:       'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.04)',
}

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.06)',
  border:        'rgba(128,0,0,0.12)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#6b3737',
  textTertiary:  'rgba(45,10,10,0.52)',
  accent:        '#800000',
  accentText:    '#9b1c1c',
  accentSurface: 'rgba(128,0,0,0.10)',
  tabBar:        'rgba(253,244,244,0.92)',
  divider:       'rgba(128,0,0,0.12)',
  surfaceSubtle: 'rgba(128,0,0,0.05)',
}

export const statusColors = {
  strong: '#4ade80',
  weak:   '#f87171',
  review: '#fbbf24',
} as const

export const typography = {
  xs:      11,
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

export type Theme      = typeof darkTheme
export type Typography = typeof typography
