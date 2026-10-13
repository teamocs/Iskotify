// Tests render with the app's one real palette (theme/tokens.ts), so the mock
// can't drift from the product. There is no dark theme.
const { lightTheme, motion, glass } = require('../theme/tokens')

const value = { theme: lightTheme, motion, glass }

module.exports = {
  ThemeProvider: ({ children }) => children,
  useTheme: () => value,
}
