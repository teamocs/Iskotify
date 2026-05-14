# Sprint 4 — Mobile Screens Design

## Goal

Replace all tab screen stubs with fully functional screens (Home, Practice, Listings, Profile) and add a new Settings screen. All screens read exclusively from local Drizzle/SQLite — no additional Supabase calls beyond the existing `syncOnLaunch`. No schema changes required.

## Context

- **Stack:** Expo 54 · Expo Router v4 · NativeWind v4 · expo-sqlite + Drizzle ORM · `@lineiconshq/react-native-lineicons`
- **App root:** `apps/mobile`
- **Existing working pieces:** `syncOnLaunch`, `TabBar.tsx` (BlurView pill), `onboarding.tsx`, `profile.tsx` (Change Exam + Export), `_layout.tsx` (SQLiteProvider → DrizzleProvider → AppInit)
- **Drizzle schema (unchanged):** `subjects`, `topics`, `flashcards`, `listings`, `userSettings`, `userProgress`

---

## Design System

All screens share these exact tokens — derived from `TabBar.tsx` and admin `tailwind.config.ts`:

| Token | Value | NativeWind equivalent |
|---|---|---|
| Background | `#1a1a2e` | `bg-[#1a1a2e]` |
| Card bg | `rgba(255,255,255,0.10)` | `bg-white/10` |
| Card border | `rgba(255,255,255,0.20)` | `border-white/20` |
| Active accent | `rgba(128,0,0,0.82)` | `bg-[rgba(128,0,0,0.82)]` |
| Accent dim | `rgba(128,0,0,0.12)` | `bg-[rgba(128,0,0,0.12)]` |
| Accent text | `#fca5a5` | `text-[#fca5a5]` |
| Secondary text | `rgba(255,255,255,0.62)` | `text-white/60` |
| Muted text | `rgba(255,255,255,0.38)` | `text-white/40` |
| Card radius | 22 dp | `rounded-[22px]` |
| Inner radius | 16 dp | `rounded-2xl` |
| Pill radius | 980 dp | `rounded-full` |

**Typography:** Outfit (headings/titles, weight 600–700) + Lexend (body/captions, weight 400–600). Must be loaded via `expo-font` + `@expo-google-fonts/outfit` + `@expo-google-fonts/lexend` — loaded in `_layout.tsx` before rendering.

**Icons:** `@lineiconshq/react-native-lineicons` (already installed). Key icon names: `Home2Outlined`, `Bolt2Outlined`, `GraduationCap1Outlined`, `User4Outlined`, `Gear1Outlined`, `Funnel1Outlined`, `Download1Outlined`, `Shield2Outlined`, `QuestionMarkCircleOutlined`, `SparkOutlined`, `Brush2Outlined`.

**No horizontal scroll** — all filter chip rows use `flexWrap: 'wrap'`.

---

## Navigation Structure

```
_layout.tsx (Stack, headerShown: false)
  ├── (tabs)/_layout.tsx  (TabBar)
  │   ├── index.tsx          Home
  │   ├── practice.tsx       Practice Hub
  │   ├── listings.tsx       Listings Hub
  │   └── profile.tsx        Profile  (keep existing, minor polish)
  ├── onboarding.tsx         (unchanged)
  ├── settings.tsx           NEW — push from Home gear icon
  └── practice/
      └── [topicId].tsx      NEW — push from Practice Hub topic tap
```

Settings is a Stack screen (not a tab). `router.push('/settings')` from the Home header gear icon. Back button (`router.back()`) in the settings header.

---

## Screen 1 — Home Tab (`app/(tabs)/index.tsx`)

### Layout (top → bottom)

1. **Greeting row** — time-based greeting left ("Good morning ☀️"), `Gear1Outlined` button right → `router.push('/settings')`
2. **Kuya Baw card** — maroon-bordered glass card. Avatar (`SparkOutlined` on maroon gradient), "Kuya Baw" label, "AI Coach" chip. Template message using `daysLeft` and `weakTopics[0]`:  
   `"Kamusta! {daysLeft} days na lang bago ang {listingTitle}. Mag-focus tayo sa {weakTopic} ngayon — ito ang pinaka-mahina mo. Kaya mo 'yan! 💪"`  
   Falls back to generic message when no progress data yet.
3. **Stats row** — three equal glass cards: Days Left (accent text), Accuracy % (white), Streak 🔥 (amber). Shows `—` when no data.
4. **Quick Practice CTA** — full-width maroon pill button with `Bolt2Outlined` icon → `router.push('/practice/' + weakTopics[0]?.id ?? firstTopicId)`.
5. **Weak Areas** section — "Weak Areas" section label + `flex-wrap` chips for topics with accuracy < 60%. Tapping a chip → `router.push('/practice/' + topic.id)`. Shows "Start practicing to see weak areas" placeholder when no progress.

### Data hook: `hooks/useHomeStats.ts`

```ts
// Returns: { listing, daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId }
```

Queries:
- `listing`: `db.select().from(listings).where(eq(listings.slug, selectedListingSlug)).limit(1)`
- `daysLeft`: `Math.ceil((listing.examDate! - Date.now()) / 86_400_000)` — shows `null` if `examDate` is null
- `todayAccuracy`: `userProgress` where `answeredAt >= startOfToday()` — `correct / total * 100`
- `streakDays`: group `userProgress.answeredAt` by calendar day (`Math.floor(ts / 86_400_000)`), count consecutive days backward from today
- `weakTopics`: join `userProgress → flashcards → topics`, group by topic, calculate accuracy, filter `< 60`, order ASC, limit 4
- `firstTopicId`: `db.select().from(topics).limit(1)` — fallback when no weak topics

---

## Screen 2 — Practice Hub (`app/(tabs)/practice.tsx`)

### Layout (top → bottom)

1. **Header** — "Practice" title (Outfit 700), subtitle showing listing title + total synced card count
2. **Subject filter chips** — `flex-wrap` row. "All" chip (active by default) + one chip per subject. Tapping filters topic list.
3. **"Topics" section label** with "Sort" link (no-op for Sprint 4, UI only)
4. **Topic list** — `FlatList` of topic cards, each showing:
   - Colour-tinted icon box (red=weak, green=strong, amber=review, maroon=new)
   - Topic name (Outfit 600) + card count + last practiced date
   - Strength badge chip: **Weak** / **Strong** / **Review** / **New**
   - Tap → `router.push('/practice/' + topic.id)`

### Strength logic

| Badge | Condition |
|---|---|
| New | No `userProgress` records for any flashcard in this topic |
| Weak | Accuracy < 50% |
| Review | Accuracy 50–79% |
| Strong | Accuracy ≥ 80% |

### Data hook: `hooks/usePracticeData.ts`

```ts
// Returns: { subjects, topicRows, selectedSubjectId, setSelectedSubjectId, totalCards }
// topicRows: { topic, cardCount, lastPracticedAt, accuracy, strength }[]
```

Queries:
- `subjects`: `db.select().from(subjects)`
- `topics`: `db.select().from(topics)` — filter by `subjectId` if subject selected
- Per topic: `COUNT(flashcards)` + latest `MAX(userProgress.answeredAt)` + accuracy from `userProgress`

---

## Screen 3 — Flashcard Engine (`app/practice/[topicId].tsx`)

### Layout (top → bottom)

1. **Top bar** — back chevron, topic name (Outfit 700), card counter "7 / 20"
2. **Progress bar** — thin red gradient bar, `width: (currentIndex / total) * 100%`
3. **Flashcard** — large glass card (min-height ~240 dp), centred:
   - "QUESTION" label (Lexend 9px uppercase)
   - Question text (Outfit 600 15px)
   - "Tap to reveal answer" hint before flip; answer text + explanation after flip
4. **Difficulty chip** — centred below card (Easy / Medium / Hard from `flashcard.difficulty` 1/2/3)
5. **Action buttons** — two equal buttons: ✕ Wrong (red tint) · ✓ Correct (green tint). Only visible after card is flipped.

### Session mechanics

- Load all flashcards for `topicId`, shuffle on mount (Fisher-Yates)
- State: `currentIndex`, `flipped`, `results: { flashcardId, correct }[]`
- Tap card body → `setFlipped(true)`
- Press Correct/Wrong → push to `results`, advance to next card (reset `flipped`)
- Last card → batch-insert all `results` to `userProgress` → show inline results summary (same screen, replace card with summary view — no separate route needed)

### Results summary (inline, same screen)

Shown after last card. Displays:
- Accuracy % (large stat)
- Correct count / Wrong count
- Two buttons: "Practice Again" (reset session) · "Back to Topics" (`router.back()`)

### Data query

```ts
const cards = await db.select().from(flashcards).where(eq(flashcards.topicId, topicId))
// Shuffle client-side, no DB query needed for session ordering
```

Insert on session complete:
```ts
db.transaction((tx) => {
  for (const r of results) {
    tx.insert(userProgress).values({
      flashcardId: r.flashcardId,
      correct: r.correct,
      answeredAt: Date.now(),
    }).run()
  }
})
```

---

## Screen 4 — Listings Hub (`app/(tabs)/listings.tsx`)

### Layout (top → bottom)

1. **Header** — "Listings" title, "Exams & Scholarships" subtitle
2. **Segment control** — All | Exams | Scholarships (pill segment, maroon active)
3. **Search + filter row** — glass search input with `SearchAlt` icon left + vertical divider + `Funnel1Outlined` filter icon right (filter icon is UI-only in Sprint 4)
4. **Listing list** — `FlatList` of listing cards, each showing:
   - **Icon box** tinted by type (maroon for exam, green for scholarship)
   - **Row 1:** Title (Outfit 700, truncated) + type badge chip right
   - **Row 2:** Exam date formatted ("Aug 1, 2026") + bookmark icon right (UI-only, no persistence Sprint 4)
5. **Empty state** — "No listings found" when search has no matches

### Filtering logic (client-side, no extra queries)

1. Load all `listings` from local DB once on mount
2. Filter by segment: `type === 'exam'` | `type === 'scholarship'` | all
3. Filter by search text: `title.toLowerCase().includes(query)`
4. Sort by `examDate` ascending (nulls last)

### Exam date format

```ts
const formatted = listing.examDate
  ? new Date(listing.examDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'Date TBA'
```

---

## Screen 5 — Settings (`app/settings.tsx`)

Stack screen (not a tab). Header: back button left, "Settings" title.

### Layout (top → bottom)

1. **Title + version badge** — "Settings" (Outfit 700 18px) + inline pill showing "Iskotify · v1.0.0" (version from `Constants.expoConfig?.version ?? '1.0.0'`)
2. **Profile card** — glass card: maroon-gradient avatar with `User4Outlined`, listing title + "Class of 2027" subtitle, chevron right (tap → no-op Sprint 4, future: profile edit)
3. **App section**
   - About Iskotify (`SparkOutlined`, maroon tint) → `Alert.alert('Iskotify', 'Version ...')`
   - Help & Support (`QuestionMarkCircleOutlined`, blue tint) → `Alert.alert('Help', 'Coming soon')`
   - Privacy & Terms (`Shield2Outlined`, amber tint) → `Alert.alert('Privacy', 'Coming soon')`
4. **Data section**
   - Export Data (`Download1Outlined`, green tint) → calls existing `exportUserData(db)` from `services/export`
5. **Appearance section**
   - Theme (`Brush2Outlined`, dimmed) — disabled row, opacity 0.5, "Coming soon" badge chip

### Version source

```ts
import Constants from 'expo-constants'
const version = Constants.expoConfig?.version ?? '1.0.0'
```

---

## Profile Tab (minor polish only)

The existing `profile.tsx` has "Change Exam" and "Export Data" and is functional. In Sprint 4, apply the design system (background, card styles, Outfit/Lexend fonts). Do **not** remove Export Data from Profile — keep it alongside Settings for now.

---

## Font Loading (prerequisite)

Install: `npx expo install @expo-google-fonts/outfit @expo-google-fonts/lexend expo-font`

In `apps/mobile/app/_layout.tsx`, load fonts before rendering:

```ts
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular, Outfit_600SemiBold, Outfit_700Bold
} from '@expo-google-fonts/outfit'
import {
  Lexend_300Light, Lexend_400Regular, Lexend_500Medium, Lexend_600SemiBold
} from '@expo-google-fonts/lexend'
```

Block on `fontsLoaded` — keep `SplashScreen.preventAutoHideAsync()` open until both fonts + DB init complete.

Add font aliases to `apps/mobile/tailwind.config.js`:

```js
theme: {
  extend: {
    fontFamily: {
      heading: ['Outfit_700Bold', 'sans-serif'],
      'heading-semi': ['Outfit_600SemiBold', 'sans-serif'],
      body: ['Lexend_400Regular', 'sans-serif'],
      'body-medium': ['Lexend_500Medium', 'sans-serif'],
      'body-semi': ['Lexend_600SemiBold', 'sans-serif'],
    }
  }
}
```

Use in NativeWind: `className="font-heading"`, `className="font-body"`.

---

## New Files Summary

| File | Action |
|---|---|
| `apps/mobile/app/(tabs)/index.tsx` | Replace stub |
| `apps/mobile/app/(tabs)/practice.tsx` | Replace stub |
| `apps/mobile/app/(tabs)/listings.tsx` | Replace stub |
| `apps/mobile/app/(tabs)/profile.tsx` | Polish only — keep logic |
| `apps/mobile/app/settings.tsx` | Create new |
| `apps/mobile/app/practice/[topicId].tsx` | Create new |
| `apps/mobile/hooks/useHomeStats.ts` | Create new |
| `apps/mobile/hooks/usePracticeData.ts` | Create new |
| `apps/mobile/app/_layout.tsx` | Add font loading |
| `apps/mobile/tailwind.config.js` | Add font family aliases |

---

## Out of Scope for Sprint 4

- Real AI for Kuya Baw (placeholder template text only)
- Bookmark persistence (icon is UI-only)
- Filter/sort functionality in Listings (icon is UI-only)
- Profile editing (name, avatar)
- Theme switching
- Push notifications / exam reminders
- Any new Supabase tables or columns
