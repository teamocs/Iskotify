import { createContext, useContext, useState, useEffect, useMemo } from 'react'
import { useColorScheme } from 'react-native'
import { eq } from 'drizzle-orm'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'
import { darkTheme, lightTheme, typography, type Theme, type Typography } from './tokens'

type ThemePref = 'system' | 'light' | 'dark'

interface ThemeContextValue {
  theme:       Theme
  typo:        Typography
  isDark:      boolean
  colorScheme: 'light' | 'dark'
  themePref:   ThemePref
  setTheme:    (pref: ThemePref) => Promise<void>
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const db           = useDb()
  const systemScheme = useColorScheme()
  const [themePref, setThemePref] = useState<ThemePref>('system')

  useEffect(() => {
    async function load() {
      const rows = await db
        .select({ theme: userSettings.theme })
        .from(userSettings)
        .where(eq(userSettings.id, 1))
        .limit(1)
      const stored = rows[0]?.theme as ThemePref | undefined
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemePref(stored)
      }
    }
    void load()
  }, [db])

  const colorScheme: 'light' | 'dark' =
    themePref === 'system' ? (systemScheme ?? 'dark') : themePref

  const isDark = colorScheme === 'dark'
  const theme  = isDark ? darkTheme : lightTheme

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    typo: typography,
    isDark,
    colorScheme,
    themePref,
    setTheme: async (pref: ThemePref) => {
      setThemePref(pref)
      await db
        .update(userSettings)
        .set({ theme: pref })
        .where(eq(userSettings.id, 1))
    },
  }), [theme, isDark, colorScheme, themePref, db])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
