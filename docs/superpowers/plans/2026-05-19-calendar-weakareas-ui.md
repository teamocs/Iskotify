# Calendar Navigation & Weak Areas UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static 7-day calendar strip with a navigable week strip (month label, ◀/▶ arrows, Today/Next-Exam jump pills) and replace the weak-areas chip list with accuracy cards showing color-coded progress bars.

**Architecture:** The hook's `calendarDays: CalendarDay[]` is replaced by two flat index arrays (`importantDayIndices`, `practiceDayIndices`); the `CalendarStrip` component owns all week-window computation via local `weekOffset` state so it can navigate freely without querying the DB. Weak areas remains data-identical — only the render layer changes (chips → cards).

**Tech Stack:** Expo / React Native, TypeScript, NativeWind, `expo-router`, `StyleSheet`

---

## File Map

| Action  | Path |
|---------|------|
| Modify  | `apps/mobile/hooks/useHomeStats.ts` |
| Modify  | `apps/mobile/hooks/__tests__/useHomeStats.test.ts` |
| Modify  | `apps/mobile/app/(tabs)/index.tsx` |

---

## Task 1: Update `useHomeStats.ts` — swap `calendarDays` for index arrays

**Files:**
- Modify: `apps/mobile/hooks/useHomeStats.ts`
- Modify: `apps/mobile/hooks/__tests__/useHomeStats.test.ts`

### Context

`CalendarDay` interface and `computeCalendarDays` function are moving out of the hook — they'll live inside the component instead. The hook only needs to tell the component *which day indices* have exams/deadlines and *which have practice*. The component handles all display logic from there.

`useHomeStats.test.ts` imports and tests `computeCalendarDays` — that entire describe block needs to go. The other three describe blocks (`computeStreak`, `computeTodayAccuracy`, `computeWeakTopics`) are unaffected.

- [ ] **Step 1: Remove `CalendarDay` interface and `computeCalendarDays` from the hook**

Open `apps/mobile/hooks/useHomeStats.ts`.

Delete the `CalendarDay` interface (currently lines 22–29):
```ts
// DELETE THIS ENTIRE BLOCK:
export interface CalendarDay {
  date: Date
  dayLetter: string
  dayNum: number
  isToday: boolean
  hasExam: boolean
  hasPractice: boolean
}
```

Delete the `DAY_LETTERS` constant and the entire `computeCalendarDays` function (currently lines 63–94):
```ts
// DELETE THIS ENTIRE BLOCK:
const DAY_LETTERS: string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function computeCalendarDays(
  focusedItems: Array<{ examDate?: number | null; deadline?: number | null }>,
  progress: Array<{ answeredAt: number }>,
  centerMs: number = Date.now(),
): CalendarDay[] {
  // ... entire function body
}
```

- [ ] **Step 2: Update the `HomeStats` interface**

Replace `calendarDays: CalendarDay[]` with two new fields:

Find:
```ts
export interface HomeStats {
  listing: { title: string; examDate: number | null } | null
  daysLeft: number | null
  todayAccuracy: number | null
  streakDays: number
  weakTopics: WeakTopic[]
  firstTopicId: string | null
  fullName: string
  calendarDays: CalendarDay[]
  focusedListings: FocusedListing[]
}
```

Replace with:
```ts
export interface HomeStats {
  listing: { title: string; examDate: number | null } | null
  daysLeft: number | null
  todayAccuracy: number | null
  streakDays: number
  weakTopics: WeakTopic[]
  firstTopicId: string | null
  fullName: string
  importantDayIndices: number[]
  practiceDayIndices: number[]
  focusedListings: FocusedListing[]
}
```

- [ ] **Step 3: Update the `DEFAULT` constant**

Find:
```ts
const DEFAULT: HomeStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: '',
  calendarDays: [],
  focusedListings: [],
}
```

Replace with:
```ts
const DEFAULT: HomeStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
  fullName: '',
  importantDayIndices: [],
  practiceDayIndices: [],
  focusedListings: [],
}
```

- [ ] **Step 4: Update `setStats` inside `load()`**

Find (inside the `load()` function in `useFocusEffect`):
```ts
calendarDays: computeCalendarDays(focusedRows, allProgress),
```

Replace with:
```ts
importantDayIndices: focusedRows.flatMap(r => [
  r.examDate != null ? Math.floor(r.examDate / 86_400_000) : null,
  r.deadline != null ? Math.floor(r.deadline / 86_400_000) : null,
]).filter((d): d is number => d != null),
practiceDayIndices: allProgress.map(p => Math.floor(p.answeredAt / 86_400_000)),
```

- [ ] **Step 5: Update the test file**

Open `apps/mobile/hooks/__tests__/useHomeStats.test.ts`.

Change line 1 from:
```ts
import { computeStreak, computeTodayAccuracy, computeWeakTopics, computeCalendarDays } from '../useHomeStats'
```
To:
```ts
import { computeStreak, computeTodayAccuracy, computeWeakTopics } from '../useHomeStats'
```

Delete the entire `describe('computeCalendarDays', ...)` block — that is, everything from line 108 to the end of the file (line 155):
```ts
// DELETE from here to end of file:
const DAY_MS = 86_400_000

describe('computeCalendarDays', () => {
  // ... all test cases ...
})
```

- [ ] **Step 6: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `useHomeStats.ts` or `useHomeStats.test.ts`. Pre-existing errors in other files are acceptable.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/hooks/useHomeStats.ts "apps/mobile/hooks/__tests__/useHomeStats.test.ts"
git commit -m "refactor(mobile): replace calendarDays with importantDayIndices/practiceDayIndices in useHomeStats"
```

---

## Task 2: Rewrite `CalendarStrip` in `index.tsx`

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

### Context

The current `CalendarStrip` is a static View showing 7 fixed days. Replace it with a component that:
- Manages `weekOffset` state (0 = current week)
- Shows 7 days centered on `today + weekOffset * 7`
- Has ◀ and ▶ arrows to navigate week by week
- Shows a month label ("May 2026" or "May – Jun 2026" when the window spans two months)
- Has a [Today] pill (visible when `weekOffset !== 0`) that resets to week 0
- Has a [📌 Exam] pill (visible when `weekOffset === 0` AND future exams exist) that jumps to the nearest exam week

The parent `HomeScreen` converts the index arrays from the hook into `Set<number>` and passes them as props.

- [ ] **Step 1: Add `useState` import and remove `CalendarDay` type import**

At the top of `apps/mobile/app/(tabs)/index.tsx`, add `useState` to the React import. Since the file currently has no React import (JSX transform handles it), add:

```ts
import { useState } from 'react'
```

as the first line of the file.

Also change the `useHomeStats` import from:
```ts
import { useHomeStats, type CalendarDay, type FocusedListing } from '../../hooks/useHomeStats'
```
To:
```ts
import { useHomeStats, type FocusedListing } from '../../hooks/useHomeStats'
```

- [ ] **Step 2: Add `DAY_LETTERS` constant near the top of the file**

After the imports (before `function CalendarStrip`), add:

```ts
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
```

- [ ] **Step 3: Replace the entire `CalendarStrip` function**

Find and delete the current `CalendarStrip` function (lines 10–29):
```ts
function CalendarStrip({ days }: { days: CalendarDay[] }) {
  if (days.length === 0) return null
  return (
    <View style={cs.row}>
      {days.map((d, i) => (
        // ...
      ))}
    </View>
  )
}
```

Replace with:
```tsx
function CalendarStrip({
  importantDays,
  practiceDays,
}: {
  importantDays: Set<number>
  practiceDays: Set<number>
}) {
  const [weekOffset, setWeekOffset] = useState(0)

  const todayDay = Math.floor(Date.now() / 86_400_000)
  const centerDay = todayDay + weekOffset * 7

  const days: Array<{
    dayIndex: number
    dayLetter: string
    dayNum: number
    isToday: boolean
    hasExam: boolean
    hasPractice: boolean
  }> = []
  for (let offset = -3; offset <= 3; offset++) {
    const dayIndex = centerDay + offset
    const date = new Date(dayIndex * 86_400_000)
    days.push({
      dayIndex,
      dayLetter: DAY_LETTERS[date.getUTCDay()] ?? 'S',
      dayNum: date.getUTCDate(),
      isToday: dayIndex === todayDay,
      hasExam: importantDays.has(dayIndex),
      hasPractice: practiceDays.has(dayIndex),
    })
  }

  // Month label — "May 2026" or "May – Jun 2026" when window spans two months
  const firstDate = new Date((centerDay - 3) * 86_400_000)
  const lastDate  = new Date((centerDay + 3) * 86_400_000)
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const monthLabel =
    fmt(firstDate) === fmt(lastDate)
      ? `${fmt(firstDate)} ${lastDate.getUTCFullYear()}`
      : `${fmt(firstDate)} – ${fmt(lastDate)} ${lastDate.getUTCFullYear()}`

  // Nearest future exam/deadline
  const futureDays = [...importantDays].filter(d => d > todayDay).sort((a, b) => a - b)
  const nearestExamDay = futureDays[0] ?? null
  const examWeekOffset =
    nearestExamDay != null ? Math.round((nearestExamDay - todayDay) / 7) : null

  const showToday    = weekOffset !== 0
  const showNextExam = weekOffset === 0 && nearestExamDay != null

  return (
    <View style={cs.container}>
      {/* Navigation row */}
      <View style={cs.navRow}>
        <View style={cs.navLeft}>
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={cs.arrowTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={cs.monthLbl}>{monthLabel}</Text>
          <TouchableOpacity
            onPress={() => setWeekOffset(w => w + 1)}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          >
            <Text style={cs.arrowTxt}>›</Text>
          </TouchableOpacity>
        </View>

        {showToday && (
          <TouchableOpacity onPress={() => setWeekOffset(0)} style={cs.pill}>
            <Text style={cs.pillTxt}>Today</Text>
          </TouchableOpacity>
        )}
        {showNextExam && examWeekOffset != null && (
          <TouchableOpacity
            onPress={() => setWeekOffset(examWeekOffset)}
            style={[cs.pill, cs.pillExam]}
          >
            <Text style={[cs.pillTxt, cs.pillExamTxt]}>📌 Exam</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Days row */}
      <View style={cs.row}>
        {days.map((d, i) => (
          <View key={i} style={cs.dayCol}>
            <Text style={[cs.letter, d.isToday && cs.letterToday]}>
              {d.dayLetter}
            </Text>
            <View style={[
              cs.circle,
              d.isToday && cs.circleToday,
              d.hasExam && !d.isToday && cs.circleExam,
            ]}>
              <Text style={[cs.num, d.isToday && cs.numToday]}>
                {d.dayNum}
              </Text>
            </View>
            <View style={[
              cs.dot,
              d.hasPractice && cs.dotActive,
              d.hasExam && cs.dotExam,
            ]} />
          </View>
        ))}
      </View>
    </View>
  )
}
```

- [ ] **Step 4: Update `HomeScreen` — destructuring and Sets**

In `HomeScreen`, change the destructuring from:
```ts
const { listing, daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId, fullName, calendarDays, focusedListings } = useHomeStats()
```
To:
```ts
const { listing, daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId, fullName, importantDayIndices, practiceDayIndices, focusedListings } = useHomeStats()
```

Directly after the `useAnalytics` line, add:
```ts
const importantDays = new Set(importantDayIndices)
const practiceDays  = new Set(practiceDayIndices)
```

- [ ] **Step 5: Update the CalendarStrip usage in JSX**

Find:
```tsx
{/* 7-day calendar strip — MOVED BELOW AI COACH */}
<View style={s.calendarWrap}>
  <CalendarStrip days={calendarDays} />
</View>
```

Replace with:
```tsx
{/* 7-day calendar strip — navigable */}
<View style={s.calendarWrap}>
  <CalendarStrip importantDays={importantDays} practiceDays={practiceDays} />
</View>
```

- [ ] **Step 6: Replace the CalendarStrip styles**

Find the entire `cs = StyleSheet.create({...})` block and replace with:

```ts
const cs = StyleSheet.create({
  container: { paddingVertical: 6 },
  navRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 8 },
  navLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  arrowTxt: { fontSize: 22, color: 'rgba(255,255,255,0.55)', fontFamily: 'Outfit_700Bold', lineHeight: 26 },
  monthLbl: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_700Bold', minWidth: 90, textAlign: 'center' },
  pill: { marginLeft: 'auto', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 3 },
  pillTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.70)', fontFamily: 'Lexend_600SemiBold' },
  pillExam: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)' },
  pillExamTxt: { color: '#fca5a5' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 3, flex: 1 },
  letter: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.35)', fontFamily: 'Lexend_600SemiBold' },
  letterToday: { color: '#fca5a5' },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  circleToday: { backgroundColor: '#fff' },
  circleExam: { borderWidth: 1.5, borderColor: '#fca5a5' },
  num: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.62)', fontFamily: 'Outfit_700Bold' },
  numToday: { color: '#1a1a2e' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  dotActive: { backgroundColor: '#60a5fa' },
  dotExam: { backgroundColor: '#fca5a5' },
})
```

- [ ] **Step 7: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `index.tsx`. Pre-existing errors in other files are acceptable.

- [ ] **Step 8: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat(mobile): navigable calendar strip with month label, week arrows, Today/Next-Exam pills"
```

---

## Task 3: Weak Areas — Card List with Progress Bars

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

### Context

The current weak areas section renders topic names as horizontal pill chips with no stats. Replace with vertical cards: each shows a color-coded severity dot, topic name, accuracy %, and a thin progress bar. Color tiers: red (≤30%), orange (31–50%), amber (51–59%).

- [ ] **Step 1: Add `weakTopicColor` helper**

After the `daysUntil` helper function (around line 50), add:

```ts
function weakTopicColor(accuracy: number): string {
  if (accuracy <= 30) return '#ef4444'
  if (accuracy <= 50) return '#f97316'
  return '#eab308'
}
```

- [ ] **Step 2: Replace the weak areas JSX**

Find:
```tsx
{weakTopics.length > 0 ? (
  <View style={s.chips}>
    {weakTopics.map(t => (
      <TouchableOpacity key={t.topicId} onPress={() => router.push(`/practice/${t.topicId}`)}>
        <View style={s.chip}>
          <Text style={s.chipText}>{t.topicName}</Text>
        </View>
      </TouchableOpacity>
    ))}
  </View>
) : (
  <Text style={s.empty}>Start practicing to see weak areas</Text>
)}
```

Replace with:
```tsx
{weakTopics.length > 0 ? (
  <View style={{ gap: 6, marginBottom: 4 }}>
    {weakTopics.map(t => {
      const color = weakTopicColor(t.accuracy)
      return (
        <TouchableOpacity
          key={t.topicId}
          style={s.weakCard}
          onPress={() => router.push(`/practice/${t.topicId}`)}
          activeOpacity={0.75}
        >
          <View style={[s.weakDot, { backgroundColor: color }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.weakTopRow}>
              <Text style={s.weakName} numberOfLines={1}>{t.topicName}</Text>
              <Text style={[s.weakPct, { color }]}>{t.accuracy}%</Text>
            </View>
            <View style={s.weakTrack}>
              <View style={[s.weakBar, { width: `${t.accuracy}%` as any, backgroundColor: color }]} />
            </View>
          </View>
          <Text style={s.chevron}>›</Text>
        </TouchableOpacity>
      )
    })}
  </View>
) : (
  <Text style={s.empty}>Start practicing to see weak areas</Text>
)}
```

- [ ] **Step 3: Update the StyleSheet — remove chip styles, add weak card styles**

In `s = StyleSheet.create({...})`, remove these three entries:
```ts
chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
chip: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
chipText: { fontSize: 10, fontWeight: '600', color: '#f87171', fontFamily: 'Lexend_600SemiBold' },
```

Add these new entries in the `// Weak Areas` section:
```ts
weakCard:   { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
weakDot:    { width: 8, height: 8, borderRadius: 4, flexShrink: 0, marginTop: 1 },
weakTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
weakName:   { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', flex: 1 },
weakPct:    { fontSize: 12, fontWeight: '700', fontFamily: 'Outfit_700Bold', flexShrink: 0, marginLeft: 8 },
weakTrack:  { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' },
weakBar:    { height: 3, borderRadius: 99 },
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors in `index.tsx`. Pre-existing errors in other files are acceptable.

- [ ] **Step 5: Commit**

```bash
git add "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat(mobile): weak areas — accuracy cards with color-coded progress bars"
```

---

## Final: Push

- [ ] **Push all commits**

```bash
git push
```
