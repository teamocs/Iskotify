# Profile Screen — Real User Data Design

**Goal:** Replace the minimal Profile tab with a screen that displays the user's full study identity (name, school, grade, selected exam) plus Google sign-in status and the existing action cards.

**Architecture:** All data is read from local SQLite only — no network calls on this screen. A single `useEffect` on mount loads `userSettings` (id=1) then joins `listings` on `selectedListingSlug` to get the listing title. No new hook; inline `db.select()` calls inside `useEffect`, same pattern as `apps/mobile/app/settings.tsx`. Styling follows the existing design system: `#1a1a2e` background, `rgba(255,255,255,0.10)` cards, maroon `#800000`/`#831626` accent, Outfit headings, Lexend body, Lineicons icons.

**Tech Stack:** Expo 54 · Expo Router v4 · expo-sqlite + Drizzle ORM · `@lineiconshq/react-native-lineicons` · `@expo-google-fonts/outfit` · `@expo-google-fonts/lexend`

---

## Sections

### 1. Identity Card

A single card at the top of the screen containing:

- **Avatar:** Maroon circle (`width: 52, height: 52, borderRadius: 26, backgroundColor: '#800000'`) with `User4Outlined` Lineicons icon (size 22, color `#fff`) centered inside.
- **Full Name:** `fullName` from `userSettings`. Fallback: `'Student'`. Style: `Outfit_700Bold`, 18px, white.
- **School:** `school` from `userSettings`. Fallback: `'—'`. Style: `Lexend_400Regular`, 11px, `rgba(255,255,255,0.50)`.
- **Grade chip:** If `gradeLevel` is set (9–12), render a small maroon pill `G{gradeLevel}` inline after the school. Style: `Outfit_700Bold`, 9px, white, `backgroundColor: 'rgba(128,0,0,0.82)'`, `borderRadius: 980`, `paddingHorizontal: 6, paddingVertical: 2`.
- **Selected listing:** `SparkOutlined` icon (12px, `#fca5a5`) + listing title text. Fetched by joining `listings` on `selectedListingSlug`. Fallback: `'No exam selected'`. Style: `Lexend_400Regular`, 11px, `rgba(255,255,255,0.60)`.

### 2. Google Account Row

Rendered **only** when `userSettings.googleId` is non-empty. Hidden entirely otherwise.

- Small white rounded pill containing a bold `G` lettermark (`Outfit_700Bold`, 10px, `#1a1a2e`, `backgroundColor: '#fff'`, `borderRadius: 4`, `paddingHorizontal: 4, paddingVertical: 1`).
- Email text: `userSettings.email`. Style: `Lexend_400Regular`, 11px, `rgba(255,255,255,0.60)`.
- Static badge on the right: `'Signed in with Google'` in `Lexend_600SemiBold`, 9px, `#4ade80` (green), `backgroundColor: 'rgba(34,197,94,0.10)'`, `borderRadius: 6`.
- The row itself is not tappable (no action for now).

### 3. Action Cards

Two cards below the identity section, unchanged from the current implementation:

- **Change Exam** — `Alert.alert` confirm → `db.update(userSettings).set({ selectedListingSlug: '', lastSyncedAt: 0 })` → `router.replace('/onboarding')`.
- **Export Data** — calls `exportUserData(db)` from `'../../services/export'`; wraps in `try/catch` with `Alert.alert` on failure.

### 4. Cleanup

Delete `apps/mobile/components/SplashOverlay.tsx`. The file is imported nowhere and is dead code left from a removed splash screen implementation.

---

## Data Flow

```
mount → db.select(userSettings where id=1)
      → if selectedListingSlug: db.select(listings where slug=slug)
      → setState({ fullName, school, gradeLevel, googleId, email, listingTitle })
render → identity card, google row (conditional), action cards
```

---

## Error Handling

- DB read failure: catch in `useEffect`, log warning, render with all fallback values — screen still usable.
- Empty `selectedListingSlug`: show `'No exam selected'` fallback in listing row; "Change Exam" action still works.
- `googleId` empty: Google row simply not rendered — no error state needed.

---

## Files Changed

| File | Action |
|---|---|
| `apps/mobile/app/(tabs)/profile.tsx` | Replace — full redesign with identity card + Google row + action cards |
| `apps/mobile/components/SplashOverlay.tsx` | Delete — orphaned dead code |
