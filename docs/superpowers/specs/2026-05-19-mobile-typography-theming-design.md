# Mobile Typography & Light Theme — Design Spec

## Overview

Two tightly coupled changes to the Iskotify mobile app:

1. **Typography normalization** — scale all font sizes up from the current cramped 8–12px range to standard mobile-app sizes (11–36px base scale, Option B: +4–5px shift).
2. **Light/dark theme system** — add a `ThemeContext` with color + typography tokens, a warm maroon-tinted light theme, system-preference detection, and an in-app toggle in Settings.

---

## Architecture

Three new files, zero new dependencies:

| File | Purpose |
|------|---------|
| `apps/mobile/theme/tokens.ts` | Color + typography constants for both themes |
| `apps/mobile/theme/ThemeContext.tsx` | React context provider + `useTheme()` hook |
| `apps/mobile/db/schema.ts` | Add `theme` column to `user_settings` |

Every screen/component calls `const { theme, typo } = useTheme()` and replaces hardcoded color/size values with token references. No third-party theming library.

**Theme resolution order:**
1. Read `userSettings.theme` from local DB (`'system' | 'light' | 'dark'`)
2. If `'system'`, call React Native's `useColorScheme()` → `'light' | 'dark'`
3. Fall back to `'dark'` if system preference is unavailable

---

## Color Tokens

### Dark Theme (current app palette, extracted)

| Token | Value | Used for |
|-------|-------|---------|
| `bg` | `#1a1a2e` | Page background |
| `surface` | `rgba(255,255,255,0.07)` | Cards, list rows |
| `surface2` | `rgba(255,255,255,0.12)` | Elevated cards, modals |
| `border` | `rgba(255,255,255,0.12)` | Dividers, outlines |
| `textPrimary` | `#ffffff` | Headings, main text |
| `textSecondary` | `rgba(255,255,255,0.62)` | Descriptions, sublabels |
| `textTertiary` | `rgba(255,255,255,0.38)` | Placeholders, disabled |
| `accent` | `#800000` | Buttons, active highlights |
| `accentSurface` | `rgba(128,0,0,0.18)` | Tinted card backgrounds |
| `tabBar` | `rgba(26,26,46,0.92)` | Tab bar blur background |
| `divider` | `rgba(255,255,255,0.20)` | Horizontal rule, separator lines |
| `surfaceSubtle` | `rgba(255,255,255,0.04)` | Barely-visible hover / pressed state |

### Light Theme (warm maroon-tinted)

| Token | Value | Used for |
|-------|-------|---------|
| `bg` | `#fdf4f4` | Page background |
| `surface` | `#ffffff` | Cards, list rows |
| `surface2` | `rgba(128,0,0,0.05)` | Elevated cards, modals |
| `border` | `rgba(128,0,0,0.10)` | Dividers, outlines |
| `textPrimary` | `#2d0a0a` | Headings, main text |
| `textSecondary` | `#7a4444` | Descriptions, sublabels |
| `textTertiary` | `rgba(45,10,10,0.40)` | Placeholders, disabled |
| `accent` | `#800000` | Buttons, active highlights (unchanged) |
| `accentSurface` | `rgba(128,0,0,0.10)` | Tinted card backgrounds |
| `tabBar` | `rgba(253,244,244,0.92)` | Tab bar blur background |
| `divider` | `rgba(128,0,0,0.15)` | Horizontal rule, separator lines |
| `surfaceSubtle` | `rgba(128,0,0,0.03)` | Barely-visible hover / pressed state |

### Status Colors (identical in both themes)

| Token | Value | Used for |
|-------|-------|---------|
| `strong` | `#4ade80` | Strong accuracy |
| `weak` | `#f87171` | Weak accuracy |
| `review` | `#fbbf24` | Review / streak / amber |
| `pink` | `#fca5a5` | Days-left accent / new badge |

---

## Typography Scale

Option B (+4–5px shift from current). Font families unchanged.

| Token | Value | Was | Used for |
|-------|-------|-----|---------|
| `typo.xs` | `11` | 7.5–9 | Tiny badges, status chips |
| `typo.sm` | `13` | 10–11 | Secondary labels, metadata |
| `typo.base` | `16` | 12 | Main body text |
| `typo.md` | `17` | 13–14 | Card titles, row labels |
| `typo.lg` | `20` | 16–18 | Section headers |
| `typo.xl` | `22` | 18–20 | Screen subtitles |
| `typo.h3` | `26` | 22–24 | Page headings |
| `typo.h2` | `30` | 26–28 | Large headings |
| `typo.h1` | `36` | 32–34 | Display / hero text |
| `typo.display` | `48` | 40–64 | Splash / onboarding hero |

**Font families (unchanged):**
- `Outfit_700Bold` — headings, page titles
- `Lexend_400Regular` — body text, descriptions
- `Lexend_600SemiBold` — uppercase section labels

---

## Opacity Variant Mapping

The codebase uses many `rgba(255,255,255,0.XX)` variants. Implementors must map them to the nearest token rather than creating per-value tokens:

| Current dark value | Map to token |
|--------------------|-------------|
| `rgba(255,255,255,0.04–0.07)` | `surface` |
| `rgba(255,255,255,0.10–0.12)` | `surface2` / `border` |
| `rgba(255,255,255,0.16)` | `border` |
| `rgba(255,255,255,0.20)` | `divider` |
| `rgba(255,255,255,0.38–0.45)` | `textTertiary` |
| `rgba(255,255,255,0.55–0.65)` | `textSecondary` |
| `rgba(255,255,255,0.75–1.0)` | `textPrimary` |
| `rgba(128,0,0,0.10–0.18)` | `accentSurface` |

---

## DB Schema Change

Add one column to `user_settings` in `apps/mobile/db/schema.ts`:

```ts
theme: text('theme').notNull().default('system'),
// valid values: 'system' | 'light' | 'dark'
```

Requires a new Drizzle migration file in `apps/mobile/db/migrations/`.

---

## Settings Screen Toggle

Replace the current disabled "Coming soon" Theme row with a 3-segment inline picker:

```
Appearance
[ Auto ]  [ Light ]  [ Dark ]
```

- **Auto** (default) — follows phone system dark/light mode
- **Light** — pinned light regardless of system
- **Dark** — pinned dark regardless of system

Remove the `opacity: 0.5` disabled state. The row icon uses the existing `Brush2Outlined` icon.

On segment press: call `setTheme(value)` from `useTheme()`, which writes to DB and triggers re-render.

---

## ThemeContext Implementation

```ts
// Provided values
interface ThemeContextValue {
  theme: typeof darkTheme   // full token object
  typo: typeof typography   // font size scale
  isDark: boolean
  colorScheme: 'light' | 'dark'
  setTheme: (pref: 'system' | 'light' | 'dark') => Promise<void>
  themePref: 'system' | 'light' | 'dark'  // current stored preference
}
```

`ThemeProvider` lives in `apps/mobile/app/_layout.tsx`, wrapping the entire `<Stack>`.

---

## Screens & Components to Update

All hardcoded colors and font sizes must be replaced with token references.

**Tab screens:**
- `(tabs)/index.tsx` — Home (574 lines, highest density of hardcoded values)
- `(tabs)/practice.tsx` — Practice
- `(tabs)/listings.tsx` — Listings
- `(tabs)/analytics.tsx` — Analytics
- `(tabs)/profile.tsx` — Profile

**Standalone screens:**
- `app/settings.tsx` — Settings (add toggle, re-theme)
- `app/landing.tsx` — Landing / sign-in
- `app/onboarding.tsx` — Onboarding flow
- `app/listings/[slug].tsx` — Listing detail
- `app/practice/[topicId].tsx` — Practice topic
- `app/practice/listing/[slug].tsx` — Practice listing
- `app/practice/deck/[deckId].tsx` — Practice deck

**Components:**
- `components/TabBar.tsx` — Tab bar (uses hardcoded dark colors + blur)
- `components/SchoolPicker.tsx` — School picker modal

---

## Out of Scope

- Per-screen animated theme transitions
- Custom theme colors (beyond light/dark)
- Syncing theme preference to Supabase/cloud
- Status bar style changes (handled automatically by React Native when `backgroundColor` changes)
