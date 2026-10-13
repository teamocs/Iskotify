import { createContext, useContext } from 'react'
import {
  lightTheme, motion, glass,
  type Theme, type Motion, type Glass,
} from './tokens'

// Iskotify has one palette (the light theme), so the context is a constant.
// It stays a context — rather than a direct import — so screens keep reading
// colours through useTheme(), which the design-token guard tests rely on.

interface ThemeContextValue {
  theme:  Theme
  motion: Motion
  glass:  Glass
}

const VALUE: ThemeContextValue = { theme: lightTheme, motion, glass }

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeContext.Provider value={VALUE}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
