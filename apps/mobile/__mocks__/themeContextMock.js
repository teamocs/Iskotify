const darkTheme = {
  bg: '#1a1a2e',
  surface: 'rgba(255,255,255,0.07)',
  surface2: 'rgba(255,255,255,0.12)',
  border: 'rgba(255,255,255,0.12)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary: 'rgba(255,255,255,0.38)',
  accent: '#800000',
  accentSurface: 'rgba(128,0,0,0.18)',
  tabBar: 'rgba(26,26,46,0.92)',
  divider: 'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.04)',
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
