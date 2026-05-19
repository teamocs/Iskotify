# Mobile Typography & Light Theme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize app-wide font sizes to standard mobile scale (Option B +4–5px) and introduce a full light/dark theme system with warm maroon-tinted light theme, system-preference detection, and a 3-segment in-app toggle in Settings.

**Architecture:** Three new files (`theme/tokens.ts`, `theme/ThemeContext.tsx`, DB migration) provide the foundation. `ThemeProvider` wraps `AppInit` inside `DrizzleProvider` in `_layout.tsx`. Every screen/component calls `const { theme: t, typo } = useTheme()` and moves its `StyleSheet.create({})` into `useMemo(() => StyleSheet.create({…}), [t, typo])` so styles recompute on theme change.

**Tech Stack:** React Native, Expo SDK 54, Drizzle ORM + expo-sqlite, React context, `useColorScheme()` from `react-native`.

---

## Token Quick-Reference

Color token mapping (hardcoded dark → token):

| Hardcoded value | Token |
|---|---|
| `#1a1a2e` | `t.bg` |
| `rgba(255,255,255,0.04–0.07)` | `t.surface` |
| `rgba(255,255,255,0.08–0.09)` | `t.surface` |
| `rgba(255,255,255,0.10–0.12)` | `t.surface2` or `t.border` (border contexts) |
| `rgba(255,255,255,0.14–0.18)` | `t.border` |
| `rgba(255,255,255,0.20)` | `t.divider` |
| `rgba(255,255,255,0.25–0.45)` | `t.textTertiary` |
| `rgba(255,255,255,0.50–0.70)` | `t.textSecondary` |
| `rgba(255,255,255,0.75–1.0)` / `#fff` | `t.textPrimary` |
| `rgba(128,0,0,0.10–0.22)` | `t.accentSurface` |
| `#800000` | `t.accent` |

Typography mapping (old → token → new value):

| Old px | Token | New px | Context |
|---|---|---|---|
| 7–9 | `typo.xs` | 11 | Tiny badges, chips |
| 10–11 | `typo.sm` | 13 | Secondary labels, metadata |
| 12 (body) | `typo.base` | 16 | Main body text |
| 13–14 | `typo.md` | 17 | Card titles, row labels |
| 15–16 (headers) | `typo.lg` | 20 | Section headers |
| 17–18 (screen titles) | `typo.xl` | 22 | Screen subtitles |
| 22–24 | `typo.h3` | 26 | Page headings |
| 26–28 | `typo.h2` | 30 | Large headings |
| 32–36 | `typo.h1` | 36 | Display / hero text |
| 40–64 | `typo.display` | 48 | Splash / score hero |

**Keep as literals** (same in both themes): status colors (`#4ade80`, `#f87171`, `#fbbf24`, `#fca5a5`), accent opacity variants above 0.22 (e.g. `rgba(128,0,0,0.82)`, `rgba(128,0,0,0.60)`), modal backdrops (`rgba(0,0,0,0.55)`), pass/fail result colors (`rgba(34,197,94,…)`, `rgba(239,68,68,…)`).

---

## File Structure

| Action | Path | Notes |
|---|---|---|
| Create | `apps/mobile/theme/tokens.ts` | Color + typo constants |
| Create | `apps/mobile/theme/ThemeContext.tsx` | Provider + `useTheme()` |
| Modify | `apps/mobile/db/schema.ts` | Add `theme` column |
| Modify | `apps/mobile/db/client.ts` | Add migration |
| Modify | `apps/mobile/app/_layout.tsx` | Wire `ThemeProvider` |
| Modify | `apps/mobile/app/settings.tsx` | New toggle + retheme |
| Modify | `apps/mobile/app/(tabs)/index.tsx` | Retheme (3 sub-components) |
| Modify | `apps/mobile/app/(tabs)/practice.tsx` | Retheme (5 StyleSheets) |
| Modify | `apps/mobile/app/(tabs)/listings.tsx` | Retheme |
| Modify | `apps/mobile/app/(tabs)/analytics.tsx` | Retheme |
| Modify | `apps/mobile/app/(tabs)/profile.tsx` | Retheme |
| Modify | `apps/mobile/components/TabBar.tsx` | Dynamic blur tint |
| Modify | `apps/mobile/app/landing.tsx` | Inline styles → tokens |
| Modify | `apps/mobile/app/onboarding.tsx` | Inline + StyleSheet |
| Modify | `apps/mobile/app/listings/[slug].tsx` | Retheme |
| Modify | `apps/mobile/app/practice/[topicId].tsx` | Retheme |
| Modify | `apps/mobile/app/practice/listing/[slug].tsx` | Retheme |
| Modify | `apps/mobile/app/practice/deck/[deckId].tsx` | Retheme |
| Modify | `apps/mobile/components/SchoolPicker.tsx` | Retheme |

---

## Task 1: Create `apps/mobile/theme/tokens.ts`

**Files:**
- Create: `apps/mobile/theme/tokens.ts`

- [ ] **Step 1: Create the tokens file**

```ts
// apps/mobile/theme/tokens.ts

export const darkTheme = {
  bg:            '#1a1a2e',
  surface:       'rgba(255,255,255,0.07)',
  surface2:      'rgba(255,255,255,0.12)',
  border:        'rgba(255,255,255,0.12)',
  textPrimary:   '#ffffff',
  textSecondary: 'rgba(255,255,255,0.62)',
  textTertiary:  'rgba(255,255,255,0.38)',
  accent:        '#800000',
  accentSurface: 'rgba(128,0,0,0.18)',
  tabBar:        'rgba(26,26,46,0.92)',
  divider:       'rgba(255,255,255,0.20)',
  surfaceSubtle: 'rgba(255,255,255,0.04)',
}

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.05)',
  border:        'rgba(128,0,0,0.10)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#7a4444',
  textTertiary:  'rgba(45,10,10,0.40)',
  accent:        '#800000',
  accentSurface: 'rgba(128,0,0,0.10)',
  tabBar:        'rgba(253,244,244,0.92)',
  divider:       'rgba(128,0,0,0.15)',
  surfaceSubtle: 'rgba(128,0,0,0.03)',
}

export const statusColors = {
  strong: '#4ade80',
  weak:   '#f87171',
  review: '#fbbf24',
  pink:   '#fca5a5',
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/theme/tokens.ts
git commit -m "feat(mobile): add theme tokens (colors + typography scale)"
```

---

## Task 2: Create `apps/mobile/theme/ThemeContext.tsx`

**Files:**
- Create: `apps/mobile/theme/ThemeContext.tsx`

- [ ] **Step 1: Create the context file**

```tsx
// apps/mobile/theme/ThemeContext.tsx
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
  const db          = useDb()
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/theme/ThemeContext.tsx
git commit -m "feat(mobile): add ThemeContext provider and useTheme hook"
```

---

## Task 3: DB migration — add `theme` column

**Files:**
- Modify: `apps/mobile/db/schema.ts` (line 54–64, `userSettings` table)
- Modify: `apps/mobile/db/client.ts` (line 104, end of `MIGRATIONS` array)

- [ ] **Step 1: Add column to schema.ts**

In `apps/mobile/db/schema.ts`, find the `userSettings` table and add `theme` after `notificationsEnabled`:

```ts
// Before (line 63):
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
})

// After:
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  theme: text('theme').notNull().default('system'),
})
```

- [ ] **Step 2: Add migration to client.ts**

In `apps/mobile/db/client.ts`, find the last item in the `MIGRATIONS` array (line 104) and add a new entry after it:

```ts
// Before (line 104):
  `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
]

// After:
  `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`,
]
```

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(mobile): add theme column to user_settings"
```

---

## Task 4: Wire `ThemeProvider` in `_layout.tsx`

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Add import**

After the existing imports in `_layout.tsx`, add:

```ts
import { ThemeProvider } from '../theme/ThemeContext'
```

- [ ] **Step 2: Wrap AppInit with ThemeProvider**

Find the JSX in `RootLayout` (lines 48–52):

```tsx
// Before:
      <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
        <DrizzleProvider>
          <AppInit onReady={handleReady} />
        </DrizzleProvider>
      </SQLiteProvider>

// After:
      <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
        <DrizzleProvider>
          <ThemeProvider>
            <AppInit onReady={handleReady} />
          </ThemeProvider>
        </DrizzleProvider>
      </SQLiteProvider>
```

- [ ] **Step 3: Make StatusBar dynamic in AppInit**

In `AppInit` (around line 85), add `useTheme` import and use `isDark` for the status bar:

```tsx
// Add to imports at top of file:
import { useTheme } from '../theme/ThemeContext'

// In AppInit function body, add:
function AppInit({ onReady }: { onReady: () => void }) {
  const db = useDb()
  const { isDark } = useTheme()   // ← add this line
  // ... rest unchanged ...

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />  {/* ← was style="light" */}
      <Stack screenOptions={{ headerShown: false }} />
    </>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): wire ThemeProvider in root layout"
```

---

## Task 5: Settings screen — theme toggle + retheme

**Files:**
- Modify: `apps/mobile/app/settings.tsx`

- [ ] **Step 1: Update imports**

Replace the existing imports block at the top of `settings.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  User4Outlined,
  SparkOutlined,
  QuestionMarkCircleOutlined,
  Shield2Outlined,
  Download1Outlined,
  Brush2Outlined,
} from '@lineiconshq/free-icons'
import { useDb } from '../hooks/useDb'
import { userSettings, listings } from '../db/schema'
import { exportUserData } from '../services/export'
import { useTheme } from '../theme/ThemeContext'
```

- [ ] **Step 2: Update `SettingsRow` to accept theme prop**

Replace the `SettingsRow` component so it reads the theme from context:

```tsx
function SettingsRow({
  icon, iconBg, iconColor, label, onPress, disabled,
}: {
  icon: typeof SparkOutlined
  iconBg: string
  iconColor: string
  label: string
  onPress?: () => void
  disabled?: boolean
}) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginBottom: 4 },
    rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
    rowLabel: { flex: 1, fontSize: typo.sm, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
  }), [t, typo])

  return (
    <TouchableOpacity
      style={[s.row, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      <View style={[s.rowIcon, { backgroundColor: iconBg }]}>
        <Lineicons icon={icon} size={13} color={iconColor} />
      </View>
      <Text style={[s.rowLabel, disabled && { color: t.textTertiary }]}>{label}</Text>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  )
}
```

- [ ] **Step 3: Rewrite `SettingsScreen`**

Replace the entire `SettingsScreen` export with:

```tsx
export default function SettingsScreen() {
  const db = useDb()
  const { theme: t, typo, themePref, setTheme } = useTheme()
  const [listingTitle, setListingTitle] = useState('')

  useEffect(() => {
    async function load() {
      const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = rows[0]?.selectedListingSlug ?? ''
      if (!slug) return
      const lr = await db.select({ title: listings.title }).from(listings).where(eq(listings.slug, slug)).limit(1)
      setListingTitle(lr[0]?.title ?? slug)
    }
    void load()
  }, [db])

  async function handleExport() {
    try {
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    backRow: { flexDirection: 'row' as const, paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
    backBtn: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
    backArrow: { color: t.textSecondary, fontSize: 28, lineHeight: 32 },
    scroll: { paddingHorizontal: 16, paddingBottom: 40 },
    pageTitle: { fontSize: typo.xl, fontWeight: '700' as const, color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
    versionBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 16 },
    versionApp: { fontSize: typo.xs, fontWeight: '700' as const, color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
    versionDot: { width: 3, height: 3, backgroundColor: t.textTertiary, borderRadius: 99 },
    versionNum: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    profileCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 12, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 16 },
    profileAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.accent, alignItems: 'center' as const, justifyContent: 'center' as const },
    profileName: { fontSize: typo.sm, fontWeight: '700' as const, color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    profileSub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 1, fontFamily: 'Lexend_400Regular' },
    rowChevron: { color: t.textTertiary, fontSize: 18 },
    secLabel: { fontSize: typo.xs, fontWeight: '600' as const, letterSpacing: 1.2, textTransform: 'uppercase' as const, color: t.textTertiary, marginBottom: 5, marginTop: 12, fontFamily: 'Lexend_600SemiBold' },
    // Appearance row
    appearRow: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 9, marginBottom: 4 },
    appearIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: t.surface },
    appearLabel: { fontSize: typo.sm, fontWeight: '500' as const, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    // Theme segment picker
    segWrap: { flexDirection: 'row' as const, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 10, padding: 3, gap: 2, marginLeft: 'auto' as const },
    segBtn: { paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, alignItems: 'center' as const },
    segBtnOn: { backgroundColor: t.accent },
    segTxt: { fontSize: typo.xs, fontWeight: '600' as const, color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    segTxtOn: { color: '#fff' },
  }), [t, typo])

  const THEME_OPTIONS: { label: string; value: 'system' | 'light' | 'dark' }[] = [
    { label: 'Auto', value: 'system' },
    { label: 'Light', value: 'light' },
    { label: 'Dark', value: 'dark' },
  ]

  return (
    <SafeAreaView style={s.root}>
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.pageTitle}>Settings</Text>
        <View style={s.versionBadge}>
          <Text style={s.versionApp}>Iskotify</Text>
          <View style={s.versionDot} />
          <Text style={s.versionNum}>v{version}</Text>
        </View>

        <TouchableOpacity style={s.profileCard} activeOpacity={0.8}>
          <View style={s.profileAvatar}>
            <Lineicons icon={User4Outlined} size={18} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.profileName} numberOfLines={1}>{listingTitle || 'Student'}</Text>
            <Text style={s.profileSub}>Class of 2027</Text>
          </View>
          <Text style={s.rowChevron}>›</Text>
        </TouchableOpacity>

        <Text style={s.secLabel}>App</Text>
        <SettingsRow icon={SparkOutlined} iconBg={t.accentSurface} iconColor="#fca5a5" label="About Iskotify"
          onPress={() => Alert.alert('Iskotify', `Version ${version}\n\nYour ultimate UPCAT & scholarship companion.`)} />
        <SettingsRow icon={QuestionMarkCircleOutlined} iconBg="rgba(96,165,250,0.12)" iconColor="#60a5fa" label="Help & Support"
          onPress={() => Alert.alert('Help', 'Support docs coming soon.')} />
        <SettingsRow icon={Shield2Outlined} iconBg="rgba(245,158,11,0.10)" iconColor="#fbbf24" label="Privacy & Terms"
          onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')} />

        <Text style={s.secLabel}>Data</Text>
        <SettingsRow icon={Download1Outlined} iconBg="rgba(34,197,94,0.10)" iconColor="#4ade80" label="Export Data" onPress={handleExport} />

        <Text style={s.secLabel}>Appearance</Text>
        <View style={s.appearRow}>
          <View style={s.appearIcon}>
            <Lineicons icon={Brush2Outlined} size={13} color={t.textSecondary} />
          </View>
          <Text style={s.appearLabel}>Theme</Text>
          <View style={s.segWrap}>
            {THEME_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.segBtn, themePref === opt.value && s.segBtnOn]}
                onPress={() => void setTheme(opt.value)}
                activeOpacity={0.8}
              >
                <Text style={[s.segTxt, themePref === opt.value && s.segTxtOn]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: Remove the old `const s = StyleSheet.create({...})` block** (lines 151–173 in the original). The new `s` is defined inside the component via `useMemo`.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/settings.tsx
git commit -m "feat(mobile): add theme toggle to Settings, retheme settings screen"
```

---

## Task 6: Home screen `(tabs)/index.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

The file has three sub-components with module-level StyleSheets: `CalendarStrip` (uses `cs`), `NotificationModal` (uses `nm`), and `HomeScreen` (uses `s`). Each gets `useTheme()` + `useMemo`.

- [ ] **Step 1: Update imports at top of file**

```tsx
// Change:
import { useState, useEffect } from 'react'
// To:
import { useState, useEffect, useMemo } from 'react'

// Add after existing imports:
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add `useTheme` + `useMemo` to `CalendarStrip`**

Inside the `CalendarStrip` function body (before the return), add:

```tsx
function CalendarStrip({ importantDays, practiceDays, ...rest }) {
  const { theme: t, typo } = useTheme()
  const cs = useMemo(() => StyleSheet.create({
    container: { paddingVertical: 6 },
    navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
    navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    arrowTxt: { fontSize: typo.xl, color: t.textSecondary, fontFamily: 'Outfit_700Bold', lineHeight: 26 },
    monthLbl: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_700Bold', minWidth: 90, textAlign: 'center' },
    pill: { marginLeft: 'auto', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 3 },
    pillTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    pillExam: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)' },
    pillExamTxt: { color: '#fca5a5' },
    row: { flexDirection: 'row', justifyContent: 'space-between' },
    dayCol: { alignItems: 'center', gap: 3, flex: 1 },
    letter: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
    letterToday: { color: '#fca5a5' },
    circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    circleToday: { backgroundColor: t.textPrimary },
    circleExam: { borderWidth: 1.5, borderColor: '#fca5a5' },
    num: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
    numToday: { color: t.bg },
    dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
    dotActive: { backgroundColor: '#60a5fa' },
    dotExam: { backgroundColor: '#fca5a5' },
  }), [t, typo])
  // ... rest of component body unchanged ...
}
```

Delete the module-level `const cs = StyleSheet.create({...})` block (lines 465–487).

- [ ] **Step 3: Add `useTheme` + `useMemo` to `NotificationModal`**

Inside `NotificationModal` function body, add:

```tsx
function NotificationModal({ visible, enabled, onToggle, onClose }) {
  const { theme: t, typo } = useTheme()
  const nm = useMemo(() => StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 12 },
    handle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    closeX: { fontSize: typo.md, color: t.textTertiary, padding: 4 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, marginBottom: 20, gap: 12 },
    toggleLabel: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
    toggleSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    sectionLabel: { fontSize: typo.sm, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
    typeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle },
    typeRowDisabled: { opacity: 0.38 },
    typeIcon: { fontSize: 20, width: 28, textAlign: 'center' },
    typeTitle: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 2 },
    typeSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    hint: { marginTop: 16, fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 16 },
  }), [t, typo])
  // ... rest of component body unchanged ...
}
```

Delete the module-level `const nm = StyleSheet.create({...})` block (lines 557–574).

- [ ] **Step 4: Add `useTheme` + `useMemo` to `HomeScreen`**

Inside `HomeScreen` (the default export), add after existing hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root:  { flex: 1, backgroundColor: t.bg },
  scroll: { paddingBottom: 100 },
  inner: { paddingHorizontal: 16 },
  greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16 },
  greetTime: { fontSize: typo.sm, color: t.textTertiary, marginBottom: 2, fontFamily: 'Lexend_400Regular' },
  greetName: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.5, fontFamily: 'Outfit_700Bold' },
  iconBtn: { width: 40, height: 40, backgroundColor: t.surface2, borderRadius: 14, borderWidth: 1, borderColor: t.divider, alignItems: 'center', justifyContent: 'center' },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  calendarWrap: { paddingVertical: 10 },
  kuyaCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 22, padding: 14, marginBottom: 10 },
  kuyaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kuyaAvatarLg: { width: 80, height: 80, borderRadius: 16, overflow: 'hidden', flexShrink: 0 },
  kuyaNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  kuyaName: { fontSize: typo.md, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  kuyaBadge: { marginLeft: 'auto', backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  kuyaBadgeText: { fontSize: typo.xs, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  kuyaText: { fontSize: typo.sm, color: t.textPrimary, lineHeight: 18, fontFamily: 'Lexend_400Regular' },
  kuyaLottie: { width: 80, height: 80 },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, padding: 10, alignItems: 'center' },
  statVal: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  statLbl: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Lexend_600SemiBold' },
  quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  quickIcon: { width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  quickSub: { fontSize: typo.xs, color: 'rgba(255,255,255,0.65)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  chevron: { color: t.textTertiary, fontSize: 22 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, marginTop: 8 },
  secTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  weakCard:   { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  weakDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 1 },
  weakTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  weakName:   { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', flex: 1 },
  weakPct:    { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', flexShrink: 0, marginLeft: 8 },
  weakTrack:  { height: 3, backgroundColor: t.surface, borderRadius: 99, overflow: 'hidden' },
  weakBar:    { height: 3, borderRadius: 99 },
  empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 8 },
  progressCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  progressSub: { fontSize: typo.xs, color: t.textSecondary, marginTop: 1, fontFamily: 'Lexend_400Regular' },
  progressChevron: { color: t.textTertiary, fontSize: 20 },
  upcomingCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  upcomingIcon: { width: 36, height: 36, backgroundColor: t.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  upcomingTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  upcomingMeta: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  upcomingBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, flexShrink: 0 },
  upcomingDays: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 490–554).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/(tabs)/index.tsx
git commit -m "feat(mobile): retheme home screen with dynamic theme tokens"
```

---

## Task 7: Practice tab `(tabs)/practice.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

Five StyleSheets: `fc` (in `FocusCard`), `s`, `rc`, `qs`, `m` (last four in `PracticeScreen`).

- [ ] **Step 1: Update imports**

```tsx
// Change:
import { useState, useEffect, useMemo } from 'react'
// (useMemo is likely already there for activeTopicIds etc. — just confirm it's imported)

// Add:
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Move `fc` into `FocusCard` component**

```tsx
function FocusCard({ row, isActive, onPress }: { row: FocusListing; isActive: boolean; onPress: () => void }) {
  const { theme: t, typo } = useTheme()
  const fc = useMemo(() => StyleSheet.create({
    card: { minWidth: 110, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 11, marginRight: 8 },
    cardActive: { backgroundColor: t.accentSurface, borderColor: '#831626', borderWidth: 2 },
    badge: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Lexend_600SemiBold' },
    name: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, lineHeight: 15, fontFamily: 'Outfit_700Bold' },
  }), [t, typo])

  return (
    <TouchableOpacity onPress={onPress} style={[fc.card, isActive && fc.cardActive]} activeOpacity={0.8}>
      <Text style={fc.badge}>#{row.priority} · {row.type === 'exam' ? 'Exam' : 'Scholar'}</Text>
      <Text style={fc.name} numberOfLines={2}>{row.title}</Text>
    </TouchableOpacity>
  )
}
```

Delete the module-level `const fc = StyleSheet.create({...})` block (lines 236–241).

- [ ] **Step 3: Add `useTheme` + combined StyleSheets to `PracticeScreen`**

Inside `PracticeScreen`, after existing hooks, add:

```tsx
const { theme: t, typo } = useTheme()
const styles = useMemo(() => ({
  s: StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    chipsWrap: { height: 44, marginBottom: 4 },
    chipsScroll: { flex: 1 },
    chipsContent: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
    chip: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 5 },
    chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
    chipTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    chipTxtOn: { color: '#fff' },
    secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    secTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    secSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', flex: 1, textAlign: 'right', marginLeft: 8 },
    addBtn: { width: 24, height: 24, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    addBtnTxt: { color: '#fff', fontSize: 14, lineHeight: 18, fontWeight: '700' },
    list: { paddingHorizontal: 16, paddingBottom: 100 },
    topicCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
    topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
    badgeText: { fontSize: typo.xs, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
    deckCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    deckIcon: { width: 36, height: 36, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    deckName: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 1 },
    deckSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    deckChevron: { color: t.textTertiary, fontSize: 18 },
    empty: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 8 },
  }),
  rc: StyleSheet.create({
    row: { gap: 10, paddingRight: 4 },
    card: { width: 130, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 12 },
    badge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
    badgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
    name: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', marginBottom: 4, lineHeight: 16 },
    sub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }),
  qs: StyleSheet.create({
    card:  { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.28)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    card2: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
    icon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    icon2: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    title: { fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    sub:   { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    go:    { fontSize: 18, color: 'rgba(128,0,0,0.80)', marginLeft: 'auto', flexShrink: 0 },
  }),
  m: StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 36, borderTopWidth: 1, borderColor: t.border, maxHeight: '85%' },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    closeBtn: { color: t.textTertiary, fontSize: 16, padding: 4 },
    label: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
    input: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.divider, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', marginBottom: 14 },
    btn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
    btnFlex: { flex: 1 },
    btnDisabled: { opacity: 0.4 },
    btnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
    topicList: { maxHeight: 280, marginBottom: 14 },
    topicRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 2, borderBottomWidth: 1, borderColor: t.surfaceSubtle },
    topicRowOn: { backgroundColor: t.accentSurface, borderRadius: 10, paddingHorizontal: 6 },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: t.textTertiary, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    checkboxOn: { backgroundColor: t.accent, borderColor: t.accent },
    checkmark: { color: '#fff', fontSize: 11, fontWeight: '700' },
    topicName: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    topicSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
    footerRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    backBtn: { paddingVertical: 12, paddingHorizontal: 4 },
    backTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  }),
}), [t, typo])
const { s, rc, qs, m } = styles
```

Delete the four module-level StyleSheet blocks (`const s`, `rc`, `qs`, `m` — lines 453–527).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/(tabs)/practice.tsx
git commit -m "feat(mobile): retheme practice tab with dynamic theme tokens"
```

---

## Task 8: Listings tab `(tabs)/listings.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/listings.tsx`

- [ ] **Step 1: Update imports**

```tsx
// Add useMemo if not present, and add useTheme:
import { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add theme hook + StyleSheet inside component**

Inside the `ListingsScreen` component, add after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  seg: { flexDirection: 'row', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 10, padding: 3, gap: 2, marginHorizontal: 16, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
  segTxt: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
  segTxtOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, marginHorizontal: 16, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', padding: 0 },
  searchDivider: { width: 1, height: 13, backgroundColor: t.divider },
  regionWrap: { height: 44, marginBottom: 2 },
  regionScroll: { flex: 1 },
  regionContent: { paddingHorizontal: 16, flexDirection: 'row', gap: 8, alignItems: 'center', paddingVertical: 6 },
  regionChip: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 5 },
  regionChipOn: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
  regionTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
  regionTxtOn: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
  scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardTitle: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  examBadge: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.25)' },
  scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
  typeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateText: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  regionLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  bookmarkBtn: { padding: 2, flexShrink: 0 },
  bookmarkIcon: { fontSize: 14, opacity: 0.35 },
  bookmarkIconSaved: { opacity: 1 },
  focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  focusBadgeTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
  empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, marginTop: 32 },
}), [t, typo])
```

Also update the `placeholderTextColor` prop on the search `TextInput`: change `'rgba(255,255,255,0.28)'` → `t.textTertiary`.

Delete the module-level `const s = StyleSheet.create({...})` block (lines 219–259).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(tabs)/listings.tsx
git commit -m "feat(mobile): retheme listings tab with dynamic theme tokens"
```

---

## Task 9: Analytics tab `(tabs)/analytics.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Update imports**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add theme hook + StyleSheet inside component**

Inside `AnalyticsScreen`, after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  tabsScroll: { maxHeight: 46, marginBottom: 4 },
  tabsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 6 },
  tab: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 980, paddingHorizontal: 14, paddingVertical: 5, maxWidth: 140 },
  tabActive: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
  tabTxt: { fontSize: typo.sm, fontWeight: '600', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
  tabTxtActive: { color: '#fff' },
  scroll: { paddingHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 14, alignItems: 'center' },
  statVal: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', letterSpacing: -0.5 },
  statLbl: { fontSize: typo.xs, color: t.textTertiary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Lexend_600SemiBold' },
  section: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: 'Lexend_600SemiBold' },
  chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: { width: '100%', height: 60, backgroundColor: t.surfaceSubtle, borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  barLabelToday: { color: '#fca5a5', fontWeight: '700' },
  barPct: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  masteryLabel: { width: 90, fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  masteryBarBg: { flex: 1, height: 6, backgroundColor: t.surface2, borderRadius: 3, overflow: 'hidden' },
  masteryBarFill: { height: 6, borderRadius: 3 },
  masteryPct: { width: 32, fontSize: typo.xs, fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold', textAlign: 'right' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.surfaceSubtle },
  recentTitle: { fontSize: typo.sm, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
  recentDate: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
  recentBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  recentBadgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  emptySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 160–198).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(tabs)/analytics.tsx
git commit -m "feat(mobile): retheme analytics tab with dynamic theme tokens"
```

---

## Task 10: Profile tab `(tabs)/profile.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Update imports**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add theme hook + StyleSheet inside component**

Inside `ProfileScreen`, after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root:          { flex: 1, backgroundColor: t.bg },
  inner:         { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title:         { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 16 },
  identityCard:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 12 },
  avatarRow:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:        { width: 52, height: 52, borderRadius: 26, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name:          { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 3 },
  schoolRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  school:        { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  gradeChip:     { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 980, paddingHorizontal: 6, paddingVertical: 2 },
  gradeText:     { fontSize: typo.xs, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  listingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5 },
  listingTitle:  { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', flex: 1 },
  googleRow:     { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.surface2 },
  googleBadge:   { backgroundColor: t.textPrimary, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  googleBadgeText: { fontSize: typo.xs, fontWeight: '700', color: t.bg, fontFamily: 'Outfit_700Bold' },
  googleEmail:   { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  signedInBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  signedInText:  { fontSize: typo.xs, fontWeight: '600', color: '#4ade80', fontFamily: 'Lexend_600SemiBold' },
  card:          { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
  cardTitle:     { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
  cardSub:       { fontSize: typo.sm, color: t.textSecondary, marginTop: 3, fontFamily: 'Lexend_400Regular' },
  focusSection:  { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 16, marginBottom: 10 },
  secTitle:      { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
  focusItem:     { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.surface },
  focusPriorityBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  focusPriorityTxt: { fontSize: typo.sm, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  focusItemTitle: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 194–223).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/(tabs)/profile.tsx
git commit -m "feat(mobile): retheme profile tab with dynamic theme tokens"
```

---

## Task 11: `components/TabBar.tsx`

**Files:**
- Modify: `apps/mobile/components/TabBar.tsx`

- [ ] **Step 1: Update imports**

```tsx
import React, { useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'
```

- [ ] **Step 2: Rewrite `NavItem` to use theme**

```tsx
function NavItem({
  label,
  icon,
  isFocused,
  onPress,
}: {
  label: string
  icon: typeof Home2Outlined
  isFocused: boolean
  onPress: () => void
}) {
  const { theme: t, typo } = useTheme()
  const scale = useSharedValue(isFocused ? 1.06 : 1)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }, [isFocused])

  function handlePressIn() {
    scale.value = withSpring(0.9, { damping: 12, stiffness: 200 })
  }
  function handlePressOut() {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }

  const styles = useMemo(() => StyleSheet.create({
    navItem: { alignItems: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 22 },
    navItemActive: { backgroundColor: 'rgba(128,0,0,0.82)' },
    navLabel: { fontSize: typo.xs, fontWeight: '500', color: t.textSecondary, letterSpacing: 0.15 },
    navLabelActive: { color: '#fff', fontWeight: '700' },
  }), [t, typo])

  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
      <Animated.View style={[styles.navItem, isFocused && styles.navItemActive, animStyle]}>
        <Lineicons icon={icon} size={20} color={isFocused ? '#fff' : t.textSecondary} />
        <Text style={[styles.navLabel, isFocused && styles.navLabelActive]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}
```

- [ ] **Step 3: Rewrite `TabBar` to use theme for blur tint and border**

```tsx
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t, isDark } = useTheme()
  const wrapStyles = useMemo(() => StyleSheet.create({
    wrapper: { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center' },
    blur: { width: 340, height: 68, borderRadius: 36, overflow: 'hidden', borderWidth: 1, borderColor: t.border },
    inner: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
      paddingHorizontal: 10,
      backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(128,0,0,0.04)',
    },
  }), [t, isDark])

  return (
    <View style={wrapStyles.wrapper} pointerEvents="box-none">
      <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={wrapStyles.blur}>
        <View style={wrapStyles.inner}>
          {state.routes.map((route, idx) => {
            const meta = TAB_META[route.name]
            if (!meta) return null
            const isFocused = state.index === idx
            function onPress() {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
              if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name)
            }
            return <NavItem key={route.key} label={meta.label} icon={meta.icon} isFocused={isFocused} onPress={onPress} />
          })}
        </View>
      </BlurView>
    </View>
  )
}
```

Delete the module-level `const styles = StyleSheet.create({...})` block (lines 113–157).

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/components/TabBar.tsx
git commit -m "feat(mobile): retheme TabBar with dynamic blur tint and theme tokens"
```

---

## Task 12: Landing screen `app/landing.tsx`

**Files:**
- Modify: `apps/mobile/app/landing.tsx`

The file uses only inline styles — no StyleSheet.create. Add `useTheme()` and replace inline color values with token references.

- [ ] **Step 1: Update imports**

```tsx
import { useTheme } from '../theme/ThemeContext'
```

- [ ] **Step 2: Add hook inside component**

```tsx
export default function LandingScreen() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [signingIn, setSigningIn] = useState(false)
  // ... rest unchanged ...
```

- [ ] **Step 3: Replace all inline styles in the JSX**

Replace the entire `return (...)` block:

```tsx
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 28, justifyContent: 'space-between', paddingTop: 56, paddingBottom: 40 }}>

        {/* Hero */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <LogoSvg width={88} height={88} viewBox="0 0 2048 2048" style={{ marginBottom: 4, borderRadius: 24 }} />

          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h1, color: t.textPrimary, textAlign: 'center', letterSpacing: -0.5 }}>
            Iskotify
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary, textAlign: 'center', lineHeight: 22, maxWidth: 280 }}>
            Your AI-powered study companion for Philippine scholarships and entrance exams.
          </Text>

          {/* Feature pills */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8 }}>
            {['Flashcards', 'Progress Tracking', 'Weak Area Focus', 'Sync Across Devices'].map(f => (
              <View key={f} style={{ backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontFamily: 'Lexend_500Medium', fontSize: typo.sm, color: '#fca5a5' }}>{f}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          {/* Google sync info */}
          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, padding: 14, gap: 4 }}>
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.sm, color: t.textPrimary }}>☁️  Back up with Google</Text>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textSecondary, lineHeight: 16 }}>
              Sign in so your progress and settings are saved. Switch devices anytime and your data comes with you.
            </Text>
          </View>

          {/* Google sign-in button */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={signingIn}
            style={{
              backgroundColor: t.textPrimary,
              borderRadius: 16,
              paddingVertical: 15,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              opacity: signingIn ? 0.7 : 1,
            }}
          >
            {signingIn ? (
              <ActivityIndicator color={t.bg} size="small" />
            ) : (
              <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.md, color: t.bg, letterSpacing: 0.1 }}>G</Text>
            )}
            <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: typo.md, color: t.bg }}>
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </Text>
          </TouchableOpacity>

          {/* Skip */}
          <TouchableOpacity onPress={handleSkip} style={{ alignItems: 'center', paddingVertical: 10 }}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textTertiary }}>
              Skip for now — set up later in Profile
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  )
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/landing.tsx
git commit -m "feat(mobile): retheme landing screen with dynamic theme tokens"
```

---

## Task 13: Onboarding screen `app/onboarding.tsx`

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`

The file has one StyleSheet (`assessStyle`) and extensive inline styles spread across three step renders. Add `useTheme()` at the top of `OnboardingScreen` and replace all inline hardcoded colors with token references.

- [ ] **Step 1: Update imports**

```tsx
import { useEffect, useState, useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'
```

- [ ] **Step 2: Add hook + move `assessStyle` inside component**

Inside `OnboardingScreen`, after `const db = useDb()`, add:

```tsx
const { theme: t, typo } = useTheme()
const assessStyle = useMemo(() => StyleSheet.create({
  questionCard: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 22, padding: 20, marginBottom: 4 },
  questionLabel: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 23, fontFamily: 'Outfit_600SemiBold' },
  optionBtn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionLetter: { width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.25)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterTxt: { fontSize: typo.sm, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  optionText: { fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', flex: 1, lineHeight: 19 },
  resultPct: { fontSize: typo.display, fontWeight: '700', color: '#fca5a5', letterSpacing: -2, fontFamily: 'Outfit_700Bold', marginBottom: 8 },
  resultTitle: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 8, textAlign: 'center' },
  resultSub: { fontSize: typo.md, color: t.textSecondary, fontFamily: 'Lexend_400Regular', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  resultCounts: { flexDirection: 'row', gap: 40, marginBottom: 32 },
  resultCount: { alignItems: 'center' },
  resultNum: { fontSize: typo.h1, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  resultLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 16, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%' },
  primaryBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
}), [t, typo])
```

Delete the module-level `const assessStyle = StyleSheet.create({...})` block (lines 481–498).

- [ ] **Step 3: Replace inline hardcoded colors in Step 1 JSX**

In the step 1 return block, replace every hardcoded color/size with tokens. Key replacements:

```tsx
// SafeAreaView background:
style={{ flex: 1, backgroundColor: t.bg }}

// Progress dots:
style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: t.accent }}  // active
style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: t.divider }}  // inactive

// Heading text:
style={{ fontFamily: 'Outfit_700Bold', fontSize: typo.h3, color: t.textPrimary, marginBottom: 4 }}

// Sub text:
style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textSecondary }}

// Label above inputs:
// (labelStyle is defined inline — replace with:)
const labelStyle = { fontFamily: 'Lexend_600SemiBold', fontSize: typo.xs, color: t.textTertiary, letterSpacing: 0.8, textTransform: 'uppercase' as const, marginBottom: 8 }

// TextInput:
const inputStyle = { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary }

// placeholderTextColor: t.textTertiary

// Grade buttons:
backgroundColor: active ? '#831626' : t.surface
borderColor: active ? '#831626' : t.border
color: active ? '#fff' : t.textSecondary
fontSize: typo.md

// Next button:
backgroundColor: isValid ? 'rgba(128,0,0,0.82)' : t.surface
color: isValid ? '#fff' : t.textTertiary
fontSize: typo.md

// K-12 helper text:
style={{ fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary, marginBottom: 10 }}
```

- [ ] **Step 4: Replace inline colors in Step 2 JSX**

```tsx
// SafeAreaView: backgroundColor: t.bg
// Progress dots: active=#831626, inactive=t.divider
// Back link: color: t.textTertiary
// Heading: color: t.textPrimary, fontSize: typo.h3
// Sub: color: t.textSecondary, fontSize: typo.md
// Listing card (selected): backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.35)'
// Listing card (unselected): backgroundColor: t.surface, borderColor: t.border
// Listing title: color: t.textPrimary
// Priority badge: backgroundColor: t.accent, color: '#fff'
// Continue button: backgroundColor: canContinue ? 'rgba(128,0,0,0.82)' : t.surface
```

- [ ] **Step 5: Replace inline colors in Step 3 (pre-assessment) JSX**

Step 3 uses `assessStyle` (already converted). For any remaining inline colors in the step 3 wrapper/progress:

```tsx
// SafeAreaView: backgroundColor: t.bg
// Progress dots: active=t.accent, inactive=t.divider
// Back link: color: t.textTertiary
// Question counter text: color: t.textTertiary
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile): retheme onboarding screen with dynamic theme tokens"
```

---

## Task 14: Listings detail `app/listings/[slug].tsx`

**Files:**
- Modify: `apps/mobile/app/listings/[slug].tsx`

- [ ] **Step 1: Update imports**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add theme hook + StyleSheet inside component**

After other hooks in the default export component:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
  topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  saveBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  saveBtnIcon: { fontSize: 18, opacity: 0.35 },
  saveBtnIconSaved: { opacity: 1 },
  empty: { textAlign: 'center', color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 60 },
  scroll: { paddingBottom: 24 },
  hero: { marginHorizontal: 14, borderRadius: 22, padding: 16, marginBottom: 10, borderWidth: 1 },
  heroExam: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
  heroScholar: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.22)' },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  examIcon: { backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)' },
  scholarIcon: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)' },
  heroTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', lineHeight: 22, marginBottom: 2 },
  heroProvider: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  examBadge: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
  scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
  typeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  statusBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: typo.xs, fontWeight: '700', color: '#fbbf24', fontFamily: 'Lexend_600SemiBold', textTransform: 'capitalize' },
  regionBadge: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  regionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  countdownCard: { marginHorizontal: 14, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10, borderWidth: 1 },
  countdownNormal: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.20)' },
  countdownUrgent: { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.22)' },
  countdownNum: { fontSize: typo.h1, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -1 },
  countdownLabel: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
  section: { marginHorizontal: 14, marginBottom: 14 },
  sectionTitle: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
  datesGrid: { gap: 8 },
  dateCard: { backgroundColor: t.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: t.border },
  dateLabel: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateVal: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
  bodyText: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  grantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(34,197,94,0.08)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.20)', borderRadius: 14, padding: 12 },
  grantLabel: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  grantVal: { fontSize: typo.lg, fontWeight: '700', color: '#4ade80', fontFamily: 'Outfit_700Bold' },
  reqRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  reqBullet: { color: t.textTertiary, fontSize: typo.sm, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  reqText: { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  practiceBtn: { marginHorizontal: 14, backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center', marginBottom: 10 },
  practiceBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  linkBtn: { marginHorizontal: 14, borderWidth: 1, borderColor: t.divider, borderRadius: 18, paddingVertical: 12, alignItems: 'center' },
  linkBtnTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 269–320).

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/listings/[slug].tsx
git commit -m "feat(mobile): retheme listing detail screen"
```

---

## Task 15: Practice topic quiz `app/practice/[topicId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`

- [ ] **Step 1: Update imports**

```tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTheme } from '../../theme/ThemeContext'
```

- [ ] **Step 2: Add theme hook + StyleSheet inside component**

After other hooks in `QuizScreen`:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
  readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  readyIcon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  readyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
  readySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 24, textAlign: 'center' },
  rulesCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 16, width: '100%', gap: 10, marginBottom: 28 },
  ruleItem: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 18 },
  startBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', marginBottom: 10 },
  startBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
  topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  qCounter: { fontSize: typo.sm, fontWeight: '700', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  retryLink: { fontSize: typo.sm, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  dotsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, marginBottom: 8, flexWrap: 'wrap' },
  progressDot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: t.border },
  dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
  dotCurrent: { backgroundColor: '#fca5a5' },
  timerBg: { marginHorizontal: 14, height: 5, backgroundColor: t.surface2, borderRadius: 99, overflow: 'hidden' },
  timerFill: { height: 5, borderRadius: 99 },
  timerLabelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 4, marginBottom: 4 },
  timerLabel: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
  timerLabelUrgent: { color: '#f87171' },
  quizScroll: { paddingHorizontal: 14, paddingBottom: 40 },
  questionCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 18, marginBottom: 14 },
  questionMeta: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
  questionDiff: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  questionDiffTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  optionsWrap: { gap: 9 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
  optionBtnSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
  optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterBoxOn: { backgroundColor: t.accent },
  optionLetter: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
  optionLetterOn: { color: '#fff' },
  optionText: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  optionTextOn: { color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
  noPeekRow: { alignItems: 'center', marginTop: 20 },
  noPeekTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  resultsScroll: { paddingHorizontal: 14, paddingBottom: 24 },
  scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  scoreCardPass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  scoreCardFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
  scorePct: { fontSize: typo.display, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
  scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  scoreTopic: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 20 },
  scoreCounts: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  scoreCount: { alignItems: 'center' },
  scoreNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  scoreLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreDivider: { width: 1, height: 32, backgroundColor: t.border },
  reviewHeader: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
  reviewCard: { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12 },
  reviewCardOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.18)' },
  reviewCardBad: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
  reviewQHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reviewQBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  reviewQBadgeOk: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.30)' },
  reviewQBadgeBad: { backgroundColor: 'rgba(239,68,68,0.12)', borderColor: 'rgba(239,68,68,0.30)' },
  reviewQBadgeTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  timeoutBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  timeoutTxt: { fontSize: typo.xs, fontWeight: '600', color: '#fbbf24', fontFamily: 'Lexend_600SemiBold' },
  diffBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 'auto' },
  diffTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  reviewStem: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold', lineHeight: 20, marginBottom: 12 },
  reviewOptions: { gap: 6, marginBottom: 10 },
  reviewOpt: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surfaceSubtle, borderRadius: 12, paddingVertical: 9, paddingHorizontal: 10, borderWidth: 1, borderColor: 'transparent' },
  reviewOptCorrect: { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.35)' },
  reviewOptWrong: { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.30)' },
  reviewOptLetter: { width: 22, height: 22, borderRadius: 6, backgroundColor: t.surface2, textAlign: 'center', lineHeight: 22, fontSize: typo.xs, fontWeight: '700', fontFamily: 'Outfit_700Bold', color: t.textTertiary },
  reviewOptTxt: { flex: 1, fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
  correctMark: { fontSize: typo.md, color: '#4ade80', fontWeight: '700' },
  wrongMark: { fontSize: typo.md, color: '#f87171', fontWeight: '700' },
  explainBox: { backgroundColor: t.surfaceSubtle, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: t.border },
  explainLabel: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  explainTxt: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 17 },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 464–570).

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/practice/[topicId].tsx"
git commit -m "feat(mobile): retheme practice topic quiz screen"
```

---

## Task 16: Practice listing quiz `app/practice/listing/[slug].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`

- [ ] **Step 1: Update imports and add theme hook + StyleSheet inside component**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
```

Inside the component, after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
  readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  readyIcon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  readyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 4 },
  readySub: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', marginBottom: 2, textAlign: 'center' },
  readySub2: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 28, textAlign: 'center' },
  startBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', marginBottom: 10 },
  startBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
  topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  qCounter: { fontSize: typo.sm, fontWeight: '700', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  retryLink: { fontSize: typo.sm, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  dotsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, marginBottom: 8, flexWrap: 'wrap' },
  dot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: t.border },
  dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
  dotCurrent: { backgroundColor: '#fca5a5' },
  timerBg: { marginHorizontal: 14, height: 5, backgroundColor: t.surface2, borderRadius: 99, overflow: 'hidden' },
  timerFill: { height: 5, borderRadius: 99 },
  questionCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 18, marginBottom: 14 },
  questionMeta: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
  diffBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  diffTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
  optionBtnSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
  optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterBoxOn: { backgroundColor: t.accent },
  optionLetter: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
  optionText: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  scorePass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  scoreFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
  scorePct: { fontSize: typo.display, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
  scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  scoreSub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  scoreNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  scoreLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 272–315).

- [ ] **Step 2: Commit**

```bash
git add "apps/mobile/app/practice/listing/[slug].tsx"
git commit -m "feat(mobile): retheme practice listing quiz screen"
```

---

## Task 17: Practice deck quiz `app/practice/deck/[deckId].tsx`

**Files:**
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

- [ ] **Step 1: Update imports and add theme hook + StyleSheet inside component**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../../../theme/ThemeContext'
```

Inside the component, after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: t.bg },
  loadingTxt: { color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: typo.md },
  readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  readyIcon: { width: 72, height: 72, backgroundColor: t.accentSurface, borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  readyTitle: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 6 },
  readySub: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 24, textAlign: 'center' },
  rulesCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 18, padding: 16, width: '100%', gap: 10, marginBottom: 28 },
  ruleItem: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', lineHeight: 18 },
  startBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', marginBottom: 10 },
  startBtnTxt: { fontSize: typo.md, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: t.textSecondary, fontSize: 26, lineHeight: 30 },
  topBarTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
  qCounter: { fontSize: typo.sm, fontWeight: '700', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  retryLink: { fontSize: typo.sm, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  dotsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, marginBottom: 8, flexWrap: 'wrap' },
  progressDot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: t.border },
  dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
  dotCurrent: { backgroundColor: '#fca5a5' },
  timerBg: { marginHorizontal: 14, height: 5, backgroundColor: t.surface2, borderRadius: 99, overflow: 'hidden' },
  timerFill: { height: 5, borderRadius: 99 },
  timerLabelRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 4, marginBottom: 4 },
  timerLabel: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, fontFamily: 'Lexend_600SemiBold' },
  timerLabelUrgent: { color: '#f87171' },
  quizScroll: { paddingHorizontal: 14, paddingBottom: 40 },
  questionCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 22, padding: 18, marginBottom: 14 },
  questionMeta: { fontSize: typo.xs, letterSpacing: 1, textTransform: 'uppercase', color: t.textTertiary, marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: typo.lg, fontWeight: '600', color: t.textPrimary, lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
  questionDiff: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  questionDiffTxt: { fontSize: typo.xs, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  optionsWrap: { gap: 9 },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.border, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
  optionBtnSelected: { backgroundColor: t.accentSurface, borderColor: t.accent },
  optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterBoxOn: { backgroundColor: t.accent },
  optionLetter: { fontSize: typo.sm, fontWeight: '700', color: t.textSecondary, fontFamily: 'Outfit_700Bold' },
  optionLetterOn: { color: '#fff' },
  optionText: { flex: 1, fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  optionTextOn: { color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' },
  noPeekRow: { alignItems: 'center', marginTop: 20 },
  noPeekTxt: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  resultsScroll: { paddingHorizontal: 14, paddingBottom: 24 },
  scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  scoreCardPass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  scoreCardFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
  scorePct: { fontSize: typo.display, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
  scoreVerdict: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  scoreTopic: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginBottom: 20 },
  scoreCounts: { flexDirection: 'row', gap: 20, alignItems: 'center' },
  scoreCount: { alignItems: 'center' },
  scoreNum: { fontSize: typo.h2, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  scoreLbl: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  scoreDivider: { width: 1, height: 32, backgroundColor: t.border },
  reviewHeader: { fontSize: typo.sm, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', marginBottom: 10 },
  reviewCard: { borderRadius: 20, borderWidth: 1, padding: 14, marginBottom: 12 },
  reviewCardOk: { backgroundColor: 'rgba(34,197,94,0.06)', borderColor: 'rgba(34,197,94,0.18)' },
  reviewCardBad: { backgroundColor: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.18)' },
}), [t, typo])
```

Delete the module-level `const s = StyleSheet.create({...})` block (lines 478–557).

- [ ] **Step 2: Commit**

```bash
git add "apps/mobile/app/practice/deck/[deckId].tsx"
git commit -m "feat(mobile): retheme practice deck quiz screen"
```

---

## Task 18: `components/SchoolPicker.tsx`

**Files:**
- Modify: `apps/mobile/components/SchoolPicker.tsx`

- [ ] **Step 1: Update imports and add theme hook + StyleSheet inside component**

```tsx
import { useMemo } from 'react'
import { useTheme } from '../theme/ThemeContext'
```

Inside `SchoolPicker` component (the main export), after other hooks:

```tsx
const { theme: t, typo } = useTheme()
const s = useMemo(() => StyleSheet.create({
  input: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Lexend_400Regular',
    fontSize: typo.md,
    color: t.textPrimary,
  },
  trigger: { justifyContent: 'center' },
  triggerText: { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary },
  triggerTextPlaceholder: { color: t.textTertiary },
  othersInput: { marginTop: 10 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalDismissOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: t.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '82%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  sheetTitle: { fontFamily: 'Outfit_700Bold', fontSize: typo.lg, color: t.textPrimary, marginBottom: 10 },
  breadcrumb: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 12, alignItems: 'center' },
  crumbActive: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: '#fca5a5' },
  crumbSep: { fontSize: typo.sm, color: t.textTertiary },
  crumbPending: { fontFamily: 'Lexend_400Regular', fontSize: typo.sm, color: t.textTertiary },
  searchInput: { marginBottom: 10 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.surfaceSubtle,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listText: { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: t.textPrimary, flex: 1 },
  chevron: { color: t.textTertiary, fontSize: 18, marginLeft: 8 },
  othersText: { fontFamily: 'Lexend_400Regular', fontSize: typo.md, color: 'rgba(252,165,165,0.8)' },
  errorText: {
    fontFamily: 'Lexend_400Regular',
    fontSize: typo.sm,
    color: 'rgba(252,165,165,0.8)',
    textAlign: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
  },
}), [t, typo])
```

Also update any `placeholderTextColor` in the component's JSX from `'rgba(255,255,255,0.28)'` to `t.textTertiary`.

Delete the module-level `const s = StyleSheet.create({...})` block (lines 188–302).

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/SchoolPicker.tsx
git commit -m "feat(mobile): retheme SchoolPicker component"
```

---

## Self-Review Checklist

After all 18 tasks, verify:

- [ ] `apps/mobile/theme/tokens.ts` exports `darkTheme`, `lightTheme`, `statusColors`, `typography`, `Theme`, `Typography`
- [ ] `apps/mobile/theme/ThemeContext.tsx` exports `ThemeProvider`, `useTheme`
- [ ] `userSettings.theme` column exists in both `schema.ts` and `client.ts` MIGRATIONS
- [ ] `_layout.tsx` has `<ThemeProvider>` wrapping `<AppInit>` inside `<DrizzleProvider>`
- [ ] Settings screen shows 3-segment Auto/Light/Dark picker, no "Coming soon" opacity
- [ ] Every file that had a module-level `StyleSheet.create({})` now has it inside a `useMemo`
- [ ] No remaining `backgroundColor: '#1a1a2e'` or `color: '#fff'` (non-accent) in StyleSheet blocks
- [ ] `TabBar` uses `tint={isDark ? 'dark' : 'light'}` on `BlurView`
- [ ] `StatusBar` in `AppInit` uses `isDark ? 'light' : 'dark'`

