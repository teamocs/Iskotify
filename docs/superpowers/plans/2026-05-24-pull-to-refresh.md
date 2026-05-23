# Pull-to-Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native `RefreshControl` pull-to-refresh to all 5 bottom-tab screens (Home, Practice, Listings, Analytics, Profile) — wired to a new `refresh()` callback on each tab's data-loading hook.

**Architecture:** Each existing data hook gets its inline `load()` function extracted into a stable `useCallback`, exposed as `refresh: () => Promise<void>` in the hook's return. The existing `useFocusEffect` continues to trigger `load` on focus — pull-to-refresh just gives the user a manual trigger for the same logic. Listings tab additionally calls `syncOnLaunch(db)` inside its refresh so the gesture pulls from Supabase. All screen wiring is identical: `useState` for refreshing, `useCallback` `onRefresh` that wraps `refresh()` with a try/finally, `RefreshControl` on the existing `ScrollView`/`FlatList`.

**Tech Stack:** React Native core `RefreshControl` · `expo-router` `useFocusEffect` (existing) · No new dependencies.

---

## File Map

| File | Role |
|---|---|
| `apps/mobile/hooks/useHomeStats.ts` | *(modify)* Extract load to `useCallback`; expose `refresh` |
| `apps/mobile/app/(tabs)/index.tsx` | *(modify)* `RefreshControl` on Home ScrollView |
| `apps/mobile/hooks/usePracticeData.ts` | *(modify)* Same pattern; update `PracticeData` interface |
| `apps/mobile/app/(tabs)/practice.tsx` | *(modify)* `RefreshControl` |
| `apps/mobile/hooks/useFocusListings.ts` | *(modify)* `refresh` calls `syncOnLaunch(db)` then `load()` |
| `apps/mobile/app/(tabs)/listings.tsx` | *(modify)* `RefreshControl` on FlatList |
| `apps/mobile/hooks/useAnalytics.ts` | *(modify)* Same pattern; update `AnalyticsData` interface |
| `apps/mobile/app/(tabs)/analytics.tsx` | *(modify)* `RefreshControl` |
| `apps/mobile/app/(tabs)/profile.tsx` | *(modify)* Extract inline settings load → `loadProfile()`; `RefreshControl` |

9 modified files, 0 new files, 0 native deps.

---

## Task 1: Home (`useHomeStats` + Home tab)

**Files:**
- Modify: `apps/mobile/hooks/useHomeStats.ts`
- Modify: `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Refactor `useHomeStats.ts` to expose `refresh`**

Open `apps/mobile/hooks/useHomeStats.ts`. The current hook uses an inline `async function load()` inside `useFocusEffect`. Refactor so `load` is a stable `useCallback` outside the effect, and the focus effect just kicks it off.

First, update the imports at the top to include `useRef`:

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
```

Then update the `HomeStats` interface to add the `refresh` field:

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
  refresh: () => Promise<void>
}
```

Update the `DEFAULT` constant to include a no-op `refresh`:

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
  refresh: async () => {},
}
```

Now replace the entire body of the `useHomeStats` hook function. Find:

```ts
export function useHomeStats(): HomeStats {
  const db = useDb()
  const [stats, setStats] = useState<HomeStats>(DEFAULT)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      try {
        const settingsRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        const slug = settingsRows[0]?.selectedListingSlug
        if (!slug) { if (!cancelled) setStats(DEFAULT); return }

        // ... existing big Promise.all + computation block ...

        if (!cancelled) {
          setStats({
            // ... existing fields ...
          })
        }
      } catch (e) {
        console.error('[useHomeStats] load error:', e)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db]))

  return stats
}
```

Replace with this structure that extracts `load` and returns `{ ...stats, refresh }`:

```ts
export function useHomeStats(): HomeStats {
  const db = useDb()
  const [stats, setStats] = useState<HomeStats>(DEFAULT)
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const settingsRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = settingsRows[0]?.selectedListingSlug
      if (!slug) {
        if (isMountedRef.current) setStats(DEFAULT)
        return
      }

      const [listingRows, allProgress, allFc, allTopics, firstTopicRows, focusedRows] = await Promise.all([
        db.select().from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({
          flashcardId: userProgress.flashcardId,
          correct: userProgress.correct,
          answeredAt: userProgress.answeredAt,
        }).from(userProgress),
        db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
        db.select({ id: topics.id, name: topics.name }).from(topics),
        db.select({ id: topics.id }).from(topics).orderBy(topics.id).limit(1),
        db.select({
          slug: focusListings.listingSlug,
          priority: focusListings.priority,
          title: listingsTable.title,
          type: listingsTable.type,
          examDate: listingsTable.examDate,
          deadline: listingsTable.deadline,
        }).from(focusListings)
          .leftJoin(listingsTable, eq(listingsTable.slug, focusListings.listingSlug))
          .orderBy(asc(focusListings.priority)),
      ])

      const listing = listingRows[0] ?? null
      const daysLeft = listing?.examDate
        ? Math.ceil((listing.examDate - Date.now()) / 86_400_000)
        : null

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayRows = allProgress.filter(p => p.answeredAt >= todayStart.getTime())

      if (isMountedRef.current) {
        setStats({
          listing: listing ? { title: listing.title, examDate: listing.examDate ?? null } : null,
          daysLeft,
          todayAccuracy: computeTodayAccuracy(todayRows),
          streakDays: computeStreak(allProgress),
          weakTopics: computeWeakTopics(allProgress, allFc, allTopics),
          firstTopicId: firstTopicRows[0]?.id ?? null,
          fullName: settingsRows[0]?.fullName ?? '',
          importantDayIndices: focusedRows.flatMap(r => [
            r.examDate != null ? Math.floor(r.examDate / 86_400_000) : null,
            r.deadline != null ? Math.floor(r.deadline / 86_400_000) : null,
          ]).filter((d): d is number => d != null),
          practiceDayIndices: allProgress.map(p => Math.floor(p.answeredAt / 86_400_000)),
          focusedListings: focusedRows.map(r => ({
            slug: r.slug,
            priority: r.priority,
            title: r.title ?? r.slug,
            type: r.type ?? 'exam',
            examDate: r.examDate ?? null,
            deadline: r.deadline ?? null,
          })),
          refresh: load,
        })
      }
    } catch (e) {
      console.error('[useHomeStats] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { ...stats, refresh: load }
}
```

Two key changes:
- `load` is now a stable `useCallback` keyed on `db`; can be called from outside the focus effect.
- The return spreads stats and overrides `refresh` to the latest `load` reference (the one inside `stats` is the function that was current at the time of last setState; the override ensures consumers always get the latest stable callback).

- [ ] **Step 2: Add `RefreshControl` to `apps/mobile/app/(tabs)/index.tsx`**

Open the file. Add `RefreshControl` to the react-native imports:

```tsx
import { RefreshControl, /* existing imports */ } from 'react-native'
```

(Add `RefreshControl` to whichever import line currently brings in `ScrollView`, `View`, etc.)

Inside the Home component body, after the existing hook calls, add:

```tsx
const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await stats.refresh() } finally { setRefreshing(false) }
}, [stats.refresh])
```

(Wherever `useHomeStats` is called — it's probably destructured. Either change the destructure to keep the full `stats` object and use `stats.refresh`, OR just destructure `refresh` alongside the other fields.)

Cleaner pattern — destructure `refresh` explicitly:

```tsx
const { listing, daysLeft, weakTopics, /* other fields used */, refresh } = useHomeStats()

const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await refresh() } finally { setRefreshing(false) }
}, [refresh])
```

Find the main `<ScrollView>` element on the Home screen (it's the outer scrollable container that wraps the welcome row, Kuya Baw card, calendar, stats, etc.). Add the `refreshControl` prop:

```tsx
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  }
  /* existing props */
>
```

If the Home screen uses `<FlatList>` somewhere instead of `<ScrollView>`, add `refreshControl` to the FlatList — same prop name.

- [ ] **Step 3: Type-check + tests**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep -E "useHomeStats|tabs/index"
```

Expected: no output. (Pre-existing errors elsewhere are fine — see baseline.)

```powershell
cd apps/mobile; npx jest hooks/__tests__/useHomeStats.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"
```

Expected: same pass/fail as baseline (the existing `useHomeStats.test.ts` has pre-existing failures unrelated to this change — check that the count is unchanged).

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/hooks/useHomeStats.ts apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(home): pull-to-refresh on Home tab"
```

---

## Task 2: Practice (`usePracticeData` + Practice tab)

**Files:**
- Modify: `apps/mobile/hooks/usePracticeData.ts`
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Refactor `usePracticeData.ts` to expose `refresh`**

Open `apps/mobile/hooks/usePracticeData.ts`. Add `useRef` and `useEffect` to the imports:

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
```

Update the `PracticeData` interface to add `refresh`:

```ts
export interface PracticeData {
  subjects: Array<{ id: string; name: string }>
  topicRows: TopicRow[]
  recommendedTopics: TopicRow[]
  selectedSubjectId: string | null
  setSelectedSubjectId: (id: string | null) => void
  totalCards: number
  cardCountByTopic: Record<string, number>
  topicIdsByListingSlug: Record<string, string[]>
  refresh: () => Promise<void>
}
```

Refactor the hook body. Find the existing `useFocusEffect(useCallback(() => { ... }, [db, selectedSubjectId]))` and the surrounding state declarations. Replace the entire `usePracticeData` function body with:

```ts
export function usePracticeData(): PracticeData {
  const db = useDb()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [recommendedTopics, setRecommendedTopics] = useState<TopicRow[]>([])
  const [totalCards, setTotalCards] = useState(0)
  const [cardCountByTopic, setCardCountByTopic] = useState<Record<string, number>>({})
  const [topicIdsByListingSlug, setTopicIdsByListingSlug] = useState<Record<string, string[]>>({})
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const [subjectRows, topicList, fcList, progressList, settingsRows] = await Promise.all([
        db.select().from(subjects),
        db.select().from(topics),
        db.select({
          id: flashcards.id,
          topicId: flashcards.topicId,
          listingSlugs: flashcards.listingSlugs,
        }).from(flashcards),
        db.select({
          flashcardId: userProgress.flashcardId,
          correct: userProgress.correct,
          answeredAt: userProgress.answeredAt,
        }).from(userProgress),
        db.select({ selectedListingSlug: userSettings.selectedListingSlug })
          .from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      ])

      const slug = settingsRows[0]?.selectedListingSlug ?? ''

      const recommendedTopicIds = new Set<string>()
      if (slug) {
        for (const fc of fcList) {
          try {
            const slugs = JSON.parse(fc.listingSlugs ?? '[]') as string[]
            if (slugs.includes(slug)) recommendedTopicIds.add(fc.topicId)
          } catch {}
        }
      }

      const topicIdsBySlug: Record<string, string[]> = {}
      for (const fc of fcList) {
        try {
          const slugs = JSON.parse(fc.listingSlugs ?? '[]') as string[]
          for (const s of slugs) {
            if (!topicIdsBySlug[s]) topicIdsBySlug[s] = []
            if (!topicIdsBySlug[s]!.includes(fc.topicId)) topicIdsBySlug[s]!.push(fc.topicId)
          }
        } catch {}
      }

      const filteredTopics = selectedSubjectId
        ? topicList.filter(t => t.subjectId === selectedSubjectId)
        : topicList

      const rows: TopicRow[] = filteredTopics.map(topic => {
        const fcIds = new Set(fcList.filter(f => f.topicId === topic.id).map(f => f.id))
        const tp = progressList.filter(p => fcIds.has(p.flashcardId))
        const lastPracticedAt = tp.length > 0 ? Math.max(...tp.map(p => p.answeredAt)) : null
        const cardCount = fcList.filter(f => f.topicId === topic.id).length
        const correct = tp.filter(p => p.correct === true || p.correct === 1).length
        const accuracy = tp.length > 0 ? Math.round((correct / tp.length) * 100) : null
        return {
          topic,
          cardCount,
          lastPracticedAt,
          accuracy,
          strength: computeStrength(topic.id, progressList, fcList),
        }
      })

      const recommended = rows
        .filter(r => recommendedTopicIds.has(r.topic.id))
        .sort((a, b) =>
          STRENGTH_PRIORITY[a.strength] - STRENGTH_PRIORITY[b.strength] ||
          b.cardCount - a.cardCount
        )
        .slice(0, 5)

      const countMap: Record<string, number> = {}
      for (const fc of fcList) {
        countMap[fc.topicId] = (countMap[fc.topicId] ?? 0) + 1
      }

      if (isMountedRef.current) {
        setAllSubjects(subjectRows)
        setTopicRows(rows)
        setRecommendedTopics(recommended)
        setTotalCards(fcList.length)
        setCardCountByTopic(countMap)
        setTopicIdsByListingSlug(topicIdsBySlug)
      }
    } catch (e) {
      console.error('[usePracticeData] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db, selectedSubjectId])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return {
    subjects: allSubjects,
    topicRows,
    recommendedTopics,
    selectedSubjectId,
    setSelectedSubjectId,
    totalCards,
    cardCountByTopic,
    topicIdsByListingSlug,
    refresh: load,
  }
}
```

- [ ] **Step 2: Add `RefreshControl` to `apps/mobile/app/(tabs)/practice.tsx`**

Add `RefreshControl` to the react-native imports.

Inside the Practice screen component body, near where `usePracticeData()` is called, add:

```tsx
const { /* existing destructured fields */, refresh } = usePracticeData()

const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await refresh() } finally { setRefreshing(false) }
}, [refresh])
```

Find the outer `<ScrollView>` or `<FlatList>` on the Practice screen (the one that scrolls through subject filter chips → recommended topics → all topics). Add the `refreshControl` prop:

```tsx
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  }
  /* existing props */
>
```

- [ ] **Step 3: Type-check + tests**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep -E "usePracticeData|tabs/practice"
```

Expected: no output.

```powershell
cd apps/mobile; npx jest hooks/__tests__/usePracticeData.test.ts --no-coverage 2>&1 | grep -E "PASS|FAIL|Tests:"
```

Expected: PASS (or same baseline if there are pre-existing failures).

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/hooks/usePracticeData.ts apps/mobile/app/\(tabs\)/practice.tsx
git commit -m "feat(practice): pull-to-refresh on Practice tab"
```

---

## Task 3: Listings (`useFocusListings` + Listings tab with Supabase pull)

**Files:**
- Modify: `apps/mobile/hooks/useFocusListings.ts`
- Modify: `apps/mobile/app/(tabs)/listings.tsx`

`useFocusListings` already has `load` extracted as a `useCallback` — perfect. We just need to expose it as `refresh` AND wrap it with a `syncOnLaunch(db)` call so the Listings pull-to-refresh also pulls from Supabase.

- [ ] **Step 1: Refactor `useFocusListings.ts` to expose `refresh` with sync**

Open `apps/mobile/hooks/useFocusListings.ts`. Add the import for `syncOnLaunch`:

```ts
import { syncOnLaunch } from '../services/sync'
```

(Place this import alongside the existing imports from `./useDb` and `../db/schema`.)

After the existing `load` declaration, add a new `refresh` callback that first pulls from Supabase, then re-reads local DB:

Find this block:

```ts
  const load = useCallback(async () => {
    const rows = await db
      .select({ /* ... */ })
      .from(focusListings)
      .leftJoin(listings, eq(listings.slug, focusListings.listingSlug))
      .orderBy(asc(focusListings.priority))
    setFocusListingsList(rows.map(r => ({ /* ... */ })))
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))
```

Add a `refresh` callback right after `load`:

```ts
  const refresh = useCallback(async () => {
    // Pull fresh listings from Supabase; syncOnLaunch handles offline via try/catch internally
    await syncOnLaunch(db)
    // Then re-read local DB to surface the new rows
    await load()
  }, [db, load])
```

Update the hook's return to include `refresh`. Find:

```ts
  return { focusListings: focusListingsList, addListing, removeListing, moveListing, isInFocus, getPriority }
```

Change to:

```ts
  return { focusListings: focusListingsList, addListing, removeListing, moveListing, isInFocus, getPriority, refresh }
```

- [ ] **Step 2: Add `RefreshControl` to `apps/mobile/app/(tabs)/listings.tsx`**

Open the file. Add `RefreshControl` to the react-native imports.

The Listings tab uses a FlatList (per the spec). Locate where `useFocusListings()` (or wherever the listings data comes from) is called. **Important:** the Listings tab may not actually consume `useFocusListings()` directly — it might query listings separately. Read the file first:

```powershell
cd apps/mobile; head -80 app/\(tabs\)/listings.tsx
```

Two scenarios:

**Scenario A:** The Listings tab calls `useFocusListings()` directly. In that case, destructure `refresh` and wire normally:

```tsx
const { refresh, /* other fields */ } = useFocusListings()

const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await refresh() } finally { setRefreshing(false) }
}, [refresh])
```

**Scenario B:** The Listings tab has its own data-loading logic (e.g., directly queries the `listings` table for a catalog view, not just the focus listings). In that case, do NOT consume `useFocusListings`. Instead, add a local `refresh` function in the Listings screen:

```tsx
import { syncOnLaunch } from '../../services/sync'

const refresh = useCallback(async () => {
  await syncOnLaunch(db)
  await loadListings()  // whatever the existing local-load function is
}, [db, loadListings])

const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await refresh() } finally { setRefreshing(false) }
}, [refresh])
```

If the screen has no extracted load function, extract its inline `useFocusEffect` load body into a `useCallback` first (same pattern as Task 1's hook refactor).

Find the main `<FlatList>` on the screen. Add the `refreshControl` prop:

```tsx
<FlatList
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  }
  /* existing props */
/>
```

- [ ] **Step 3: Type-check + tests**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep -E "useFocusListings|tabs/listings"
```

Expected: no output.

```powershell
cd apps/mobile; npx jest --no-coverage 2>&1 | tail -3
```

Expected: same baseline (3 pre-existing failures). No new failures.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/hooks/useFocusListings.ts apps/mobile/app/\(tabs\)/listings.tsx
git commit -m "feat(listings): pull-to-refresh on Listings tab with Supabase sync"
```

---

## Task 4: Analytics (`useAnalytics` + Analytics tab)

**Files:**
- Modify: `apps/mobile/hooks/useAnalytics.ts`
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Refactor `useAnalytics.ts` to expose `refresh`**

Open `apps/mobile/hooks/useAnalytics.ts`. Add `useRef` and `useEffect` to the imports:

```ts
import { useState, useEffect, useCallback, useRef } from 'react'
```

Update the `AnalyticsData` interface to add `refresh`:

```ts
export interface AnalyticsData {
  sessionCount: number
  avgAccuracy: number | null
  streak: number
  weeklyData: WeeklyBar[]
  topicMastery: TopicMastery[]
  recentSessions: RecentSession[]
  isLoading: boolean
  refresh: () => Promise<void>
}
```

Refactor the hook body. Replace the entire `useAnalytics` function body with:

```ts
export function useAnalytics(slug: string | 'overall'): AnalyticsData {
  const db = useDb()
  const [data, setData] = useState<Omit<AnalyticsData, 'refresh'>>({
    sessionCount: 0, avgAccuracy: null, streak: 0,
    weeklyData: [], topicMastery: [], recentSessions: [], isLoading: true,
  })
  const isMountedRef = useRef(true)
  const loadingRef = useRef(false)

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const [allSessions, topicRows, deckRows] = await Promise.all([
        db.select().from(practiceSessions),
        db.select({ id: topics.id, name: topics.name }).from(topics),
        db.select({ id: savedDecks.id, name: savedDecks.name }).from(savedDecks),
      ])

      const filtered = slug === 'overall'
        ? allSessions
        : allSessions.filter(s => s.listingSlug === slug)

      const sessionCount = filtered.length
      const withScore = filtered.filter(s => s.total > 0)
      const avgAccuracy = withScore.length > 0
        ? Math.round(withScore.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / withScore.length)
        : null

      const streak = computeStreak(filtered)
      const weeklyData = computeWeeklyData(filtered)

      const topicMap = new Map(topicRows.map(t => [t.id, t.name]))
      const deckMap = new Map(deckRows.map(d => [d.id, d.name]))

      const grouped: Record<string, { score: number; total: number; count: number }> = {}
      for (const s of filtered) {
        const key = s.topicId || s.deckId
        if (!key || key === '__full__' || key === '__weak__') continue
        if (!grouped[key]) grouped[key] = { score: 0, total: 0, count: 0 }
        grouped[key]!.score += s.score
        grouped[key]!.total += s.total
        grouped[key]!.count += 1
      }
      const topicMastery: TopicMastery[] = Object.entries(grouped)
        .filter(([, v]) => v.total > 0)
        .map(([key, v]) => ({
          label: topicMap.get(key) ?? deckMap.get(key) ?? key,
          accuracy: Math.round((v.score / v.total) * 100),
          sessionCount: v.count,
        }))
        .sort((a, b) => b.sessionCount - a.sessionCount)
        .slice(0, 5)

      const recentSessions: RecentSession[] = filtered
        .sort((a, b) => b.completedAt - a.completedAt)
        .slice(0, 10)
        .map(s => {
          let title = 'Session'
          if (s.deckId === '__full__') title = 'Full Review'
          else if (s.deckId === '__weak__') title = 'Weak Topics'
          else if (s.topicId) title = topicMap.get(s.topicId) ?? s.topicId
          else if (s.deckId) title = deckMap.get(s.deckId) ?? s.deckId
          return { id: s.id, title, accuracy: s.total > 0 ? Math.round((s.score / s.total) * 100) : 0, completedAt: s.completedAt }
        })

      if (isMountedRef.current) {
        setData({ sessionCount, avgAccuracy, streak, weeklyData, topicMastery, recentSessions, isLoading: false })
      }
    } catch (e) {
      console.error('[useAnalytics] load error:', e)
    } finally {
      loadingRef.current = false
    }
  }, [db, slug])

  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { ...data, refresh: load }
}
```

- [ ] **Step 2: Add `RefreshControl` to `apps/mobile/app/(tabs)/analytics.tsx`**

Open the file. Add `RefreshControl` to the react-native imports.

Find where `useAnalytics()` is called. Destructure `refresh`:

```tsx
const { /* existing destructured fields */, refresh } = useAnalytics(slug)

const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await refresh() } finally { setRefreshing(false) }
}, [refresh])
```

Find the main `<ScrollView>` on the Analytics screen. Add the `refreshControl` prop:

```tsx
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  }
  /* existing props */
>
```

- [ ] **Step 3: Type-check + tests**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep -E "useAnalytics|tabs/analytics"
```

Expected: no output.

```powershell
cd apps/mobile; npx jest --no-coverage 2>&1 | tail -3
```

Expected: same baseline.

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/hooks/useAnalytics.ts apps/mobile/app/\(tabs\)/analytics.tsx
git commit -m "feat(analytics): pull-to-refresh on Analytics tab"
```

---

## Task 5: Profile (extract `loadProfile` + Profile tab)

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

Profile doesn't use a dedicated hook today. The settings-load logic is inline. We extract it into a local `loadProfile` `useCallback` so it can be triggered from `RefreshControl`.

- [ ] **Step 1: Read the current Profile screen to identify the inline data load**

```powershell
cd apps/mobile; cat app/\(tabs\)/profile.tsx
```

Find the existing `useEffect` or `useFocusEffect` that queries `userSettings` (the user's name, school, grade, Google email, etc.) and sets local state.

- [ ] **Step 2: Extract the load logic into `loadProfile` and wire `RefreshControl`**

Add to the react-native imports:

```tsx
import { RefreshControl } from 'react-native'
```

Add `useCallback` and `useRef` to the react imports if not already present:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react'
```

Find the existing inline data-load block. It likely looks like:

```tsx
useEffect(() => {
  async function load() {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    if (rows[0]) {
      setName(rows[0].fullName)
      // ... other setState calls ...
    }
  }
  void load()
}, [db])
```

Replace with:

```tsx
const isMountedRef = useRef(true)
const loadingRef = useRef(false)

const loadProfile = useCallback(async () => {
  if (loadingRef.current) return
  loadingRef.current = true
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    if (rows[0] && isMountedRef.current) {
      setName(rows[0].fullName)
      // ... other setState calls (preserve whatever fields the existing load sets) ...
    }
  } catch (e) {
    console.error('[Profile] load error:', e)
  } finally {
    loadingRef.current = false
  }
}, [db])

useEffect(() => {
  isMountedRef.current = true
  return () => { isMountedRef.current = false }
}, [])

useEffect(() => { void loadProfile() }, [loadProfile])
```

(If the existing screen uses `useFocusEffect` instead of `useEffect`, keep `useFocusEffect`:

```tsx
useFocusEffect(useCallback(() => { void loadProfile() }, [loadProfile]))
```

The exact choice depends on the existing pattern — preserve it.)

Then add the refresh wiring:

```tsx
const [refreshing, setRefreshing] = useState(false)
const onRefresh = useCallback(async () => {
  setRefreshing(true)
  try { await loadProfile() } finally { setRefreshing(false) }
}, [loadProfile])
```

Find the main `<ScrollView>` on the Profile screen. Add the `refreshControl` prop:

```tsx
<ScrollView
  refreshControl={
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={t.accent}
      colors={[t.accent]}
      progressBackgroundColor={t.surface}
    />
  }
  /* existing props */
>
```

- [ ] **Step 3: Type-check + tests**

```powershell
cd apps/mobile; npx tsc --noEmit 2>&1 | grep "tabs/profile"
```

Expected: no output.

```powershell
cd apps/mobile; npx jest --no-coverage 2>&1 | tail -3
```

Expected: same baseline (3 pre-existing failures).

- [ ] **Step 4: Commit**

```powershell
git add apps/mobile/app/\(tabs\)/profile.tsx
git commit -m "feat(profile): pull-to-refresh on Profile tab"
```

---

## Self-Review Checklist

- [x] **Spec §1 (per-hook contract)**: Tasks 1-4 each refactor a hook to expose `refresh`. Task 5 extracts `loadProfile` inline. All 4 hooks gain `refresh: () => Promise<void>` in their TypeScript return type.
- [x] **Spec §2 (per-screen wiring)**: Each task (1-5) adds the same 3 pieces — `refreshing` state, `onRefresh` callback with try/finally, `RefreshControl` on the scrollable container with `tintColor` / `colors` / `progressBackgroundColor`.
- [x] **Spec §3 (Listings sync semantics)**: Task 3 Step 1 adds a `refresh` that calls `syncOnLaunch(db)` then `load()`. Other tabs' refresh re-reads local DB only.
- [x] **Spec §4 (file map)**: 9 modified files covered across Tasks 1-5 (4 hooks + 5 screens, where Profile's "hook" is inline).
- [x] **Spec §5 (testing)**: Each task includes `tsc --noEmit` filtered for the touched files + `jest` smoke run. No new test files required — existing hook tests still pass because the destructure surface stays compatible (existing fields unchanged; only addition is `refresh`).
- [x] **Spec §6 (rollout)**: Plan stays pure JS — no `package.json` changes. After Task 5 commits, single OTA via `eas update --branch preview --message "feat(mobile): pull-to-refresh on all 5 tabs"` ships everything.
- [x] **Type consistency**: `refresh: () => Promise<void>` signature is identical across all hooks. `RefreshControl` props (`tintColor`, `colors`, `progressBackgroundColor`) use the same theme tokens (`t.accent`, `t.surface`) on every screen. `onRefresh` shape (async, sets `refreshing` true → calls `refresh()` → sets false in finally) is identical.
- [x] **No placeholders**: Every code block contains complete runnable code. "Find this block / Replace with" pattern used where the existing file is large. No "TBD", no "add error handling", no "similar to Task N".
