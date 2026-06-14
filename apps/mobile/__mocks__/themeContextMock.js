const darkTheme = {
  bg: '#1a1a2e',
  surface: 'rgba(255,255,255,0.07)',
  surface2: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.12)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary: 'rgba(255,255,255,0.38)',
  accent: '#800000',
  accentText: '#fca5a5',
  accentSurface: 'rgba(128,0,0,0.18)',
  accentStrong: 'rgba(128,0,0,0.82)',
  textInverse: '#ffffff',
  success: '#4ade80',
  successSurface: 'rgba(74,222,128,0.16)',
  danger: '#f87171',
  dangerSurface: 'rgba(248,113,113,0.16)',
  warning: '#fbbf24',
  warningSurface: 'rgba(251,191,36,0.16)',
  tabBar: 'rgba(26,26,46,0.92)',
  divider: 'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.04)',
  shadowSm: '0px 1px 3px rgba(0,0,0,0.40)',
  shadowMd: '0px 6px 18px rgba(0,0,0,0.48)',
}

const typography = { xs: 11, sm: 13, base: 16, md: 17, lg: 20, xl: 22, h3: 26, h2: 30, h1: 36, display: 48 }

module.exports = {
  ThemeProvider: ({ children }) => children,
  useTheme: () => ({
    theme: darkTheme,
    typo: typography,
    isDark: true,
    colorScheme: 'dark',
    setTheme: () => Promise.resolve(),
    themePref: 'system',
  }),
}
