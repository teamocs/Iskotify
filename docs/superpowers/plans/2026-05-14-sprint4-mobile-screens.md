# Sprint 4 Mobile Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all stub tab screens with fully functional Home, Practice, Listings, and Profile screens, and add a Settings screen and Flashcard Engine — all reading from local Drizzle/SQLite with no schema changes.

**Architecture:** Each screen is a self-contained React Native component using `SafeAreaView` + `StyleSheet` (not NativeWind classes, to avoid font-family class resolution issues with custom fonts). Data hooks (`useHomeStats`, `usePracticeData`) compute derived values from raw Drizzle queries and export pure functions for unit testing. The Flashcard Engine lives at `app/practice/[topicId].tsx` (Stack route); Settings at `app/settings.tsx` (Stack route pushed from the Home gear icon).

**Tech Stack:** Expo 54 · Expo Router v4 · expo-sqlite + Drizzle ORM · `@lineiconshq/react-native-lineicons` · `@expo-google-fonts/outfit` · `@expo-google-fonts/lexend` · Jest + React Native Testing Library (jest-expo preset)

---

## File Map

| File | Action |
|---|---|
| `apps/mobile/app/_layout.tsx` | Modify — add font loading, coordinate SplashScreen hide |
| `apps/mobile/tailwind.config.js` | Modify — add font family aliases |
| `apps/mobile/hooks/useHomeStats.ts` | Create — data hook + exported pure functions |
| `apps/mobile/hooks/usePracticeData.ts` | Create — data hook + exported pure functions |
| `apps/mobile/hooks/__tests__/useHomeStats.test.ts` | Create — unit tests for pure functions |
| `apps/mobile/hooks/__tests__/usePracticeData.test.ts` | Create — unit tests for pure functions |
| `apps/mobile/app/(tabs)/index.tsx` | Replace stub — Home screen |
| `apps/mobile/app/(tabs)/practice.tsx` | Replace stub — Practice Hub |
| `apps/mobile/app/(tabs)/listings.tsx` | Replace stub — Listings Hub |
| `apps/mobile/app/(tabs)/profile.tsx` | Modify — design system polish only |
| `apps/mobile/app/settings.tsx` | Create — Settings screen (Stack route) |
| `apps/mobile/app/practice/[topicId].tsx` | Create — Flashcard Engine (Stack route) |

---

## Task 1: Install fonts and update font config

**Files:**
- Modify: `apps/mobile/tailwind.config.js`
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Install Google Fonts packages**

```bash
cd apps/mobile && npx expo install @expo-google-fonts/outfit @expo-google-fonts/lexend
```

Expected: packages added to `apps/mobile/package.json` and `pnpm-lock.yaml`.

- [ ] **Step 2: Update tailwind config with font family aliases**

Replace the full contents of `apps/mobile/tailwind.config.js`:

```js
const sharedPreset = require("@iskotify/ui/tailwind-preset");

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [require("nativewind/preset"), sharedPreset],
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        heading:       ['Outfit_700Bold'],
        'heading-semi':['Outfit_600SemiBold'],
        body:          ['Lexend_400Regular'],
        'body-medium': ['Lexend_500Medium'],
        'body-semi':   ['Lexend_600SemiBold'],
      }
    }
  },
  plugins: []
};
```

- [ ] **Step 3: Update `apps/mobile/app/_layout.tsx` to load fonts**

Replace the full contents of `apps/mobile/app/_layout.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { useFonts } from 'expo-font'
import {
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit'
import {
  Lexend_300Light,
  Lexend_400Regular,
  Lexend_500Medium,
  Lexend_600SemiBold,
} from '@expo-google-fonts/lexend'
import { DrizzleProvider } from '../db'
import { useDb } from '../hooks/useDb'
import { syncOnLaunch } from '../services/sync'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import '../global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Lexend_300Light,
    Lexend_400Regular,
    Lexend_500Medium,
    Lexend_600SemiBold,
  })

  return (
    <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
      <DrizzleProvider>
        <AppInit fontsLoaded={fontsLoaded} />
      </DrizzleProvider>
    </SQLiteProvider>
  )
}

function AppInit({ fontsLoaded }: { fontsLoaded: boolean }) {
  const db = useDb()
  const [dbReady, setDbReady] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        await syncOnLaunch(db)
        const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
        if (!rows[0]?.selectedListingSlug) {
          router.replace('/onboarding')
        }
      } catch (e) {
        console.error('[layout] init error:', e)
        router.replace('/onboarding')
      } finally {
        setDbReady(true)
      }
    }
    void init()
  }, [db])

  useEffect(() => {
    if (dbReady && fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {})
    }
  }, [dbReady, fontsLoaded])

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
      {(!dbReady || !fontsLoaded) && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1a1a2e' }} />
      )}
    </>
  )
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/tailwind.config.js apps/mobile/app/_layout.tsx apps/mobile/package.json pnpm-lock.yaml
git commit -m "feat(mobile): load Outfit + Lexend fonts, coordinate splash hide"
```

---

## Task 2: useHomeStats hook

**Files:**
- Create: `apps/mobile/hooks/useHomeStats.ts`
- Create: `apps/mobile/hooks/__tests__/useHomeStats.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/hooks/__tests__/useHomeStats.test.ts`:

```ts
import { computeStreak, computeTodayAccuracy, computeWeakTopics } from '../useHomeStats'

const DAY = 86_400_000

describe('computeStreak', () => {
  it('returns 0 with no progress', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for a single entry today', () => {
    expect(computeStreak([{ answeredAt: Date.now() }])).toBe(1)
  })

  it('counts consecutive days backward from today', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today },
      { answeredAt: today - DAY },
      { answeredAt: today - 2 * DAY },
    ])).toBe(3)
  })

  it('breaks on a missing day', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today },
      { answeredAt: today - 2 * DAY }, // gap: today - DAY missing
    ])).toBe(1)
  })

  it('starts from yesterday if today has no entries', () => {
    const today = Math.floor(Date.now() / DAY) * DAY
    expect(computeStreak([
      { answeredAt: today - DAY },
      { answeredAt: today - 2 * DAY },
    ])).toBe(2)
  })
})

describe('computeTodayAccuracy', () => {
  it('returns null with no rows', () => {
    expect(computeTodayAccuracy([])).toBeNull()
  })

  it('returns 100 when all correct', () => {
    expect(computeTodayAccuracy([{ correct: true }, { correct: true }])).toBe(100)
  })

  it('returns 50 when half correct', () => {
    expect(computeTodayAccuracy([{ correct: true }, { correct: false }])).toBe(50)
  })

  it('handles SQLite numeric 0/1', () => {
    expect(computeTodayAccuracy([{ correct: 1 }, { correct: 0 }])).toBe(50)
  })
})

describe('computeWeakTopics', () => {
  const fcList = [
    { id: 'fc1', topicId: 't1' },
    { id: 'fc2', topicId: 't1' },
    { id: 'fc3', topicId: 't2' },
  ]
  const topicList = [
    { id: 't1', name: 'Algebra' },
    { id: 't2', name: 'Biology' },
  ]

  it('returns empty array with no progress', () => {
    expect(computeWeakTopics([], fcList, topicList)).toEqual([])
  })

  it('returns topics with accuracy < 60', () => {
    const progress = [
      { flashcardId: 'fc1', correct: false },
      { flashcardId: 'fc2', correct: false },
    ]
    const result = computeWeakTopics(progress, fcList, topicList)
    expect(result).toHaveLength(1)
    expect(result[0].topicId).toBe('t1')
    expect(result[0].accuracy).toBe(0)
    expect(result[0].topicName).toBe('Algebra')
  })

  it('excludes topics with accuracy >= 60', () => {
    const progress = [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: true },
    ]
    expect(computeWeakTopics(progress, fcList, topicList)).toHaveLength(0)
  })

  it('sorts by accuracy ascending', () => {
    const progress = [
      { flashcardId: 'fc1', correct: false },
      { flashcardId: 'fc2', correct: false }, // t1: 0%
      { flashcardId: 'fc3', correct: false },  // t2: 0%
    ]
    const result = computeWeakTopics(progress, fcList, topicList)
    expect(result.length).toBe(2)
    expect(result.every(r => r.accuracy < 60)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/mobile && pnpm jest --testPathPattern="hooks/__tests__/useHomeStats" --selectProjects=mobile
```

Expected: FAIL — `Cannot find module '../useHomeStats'`

- [ ] **Step 3: Implement `apps/mobile/hooks/useHomeStats.ts`**

```ts
import { useState, useEffect } from 'react'
import { eq } from 'drizzle-orm'
import { useDb } from './useDb'
import { userSettings, listings, userProgress, flashcards, topics } from '../db/schema'

export interface WeakTopic {
  topicId: string
  topicName: string
  accuracy: number
}

export interface HomeStats {
  listing: { title: string; examDate: number | null } | null
  daysLeft: number | null
  todayAccuracy: number | null
  streakDays: number
  weakTopics: WeakTopic[]
  firstTopicId: string | null
}

// ── Pure functions (exported for unit tests) ─────────────────────────────────

export function computeStreak(rows: Array<{ answeredAt: number }>): number {
  if (rows.length === 0) return 0
  const days = new Set(rows.map(r => Math.floor(r.answeredAt / 86_400_000)))
  const today = Math.floor(Date.now() / 86_400_000)
  let d = days.has(today) ? today : today - 1
  let streak = 0
  while (days.has(d)) { streak++; d-- }
  return streak
}

export function computeTodayAccuracy(
  rows: Array<{ correct: boolean | number }>
): number | null {
  if (rows.length === 0) return null
  const correct = rows.filter(r => r.correct === true || r.correct === 1).length
  return Math.round((correct / rows.length) * 100)
}

export function computeWeakTopics(
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
  topicList: Array<{ id: string; name: string }>,
): WeakTopic[] {
  const fcMap = new Map(fcList.map(f => [f.id, f.topicId]))
  const topicStats = new Map<string, { correct: number; total: number }>()
  for (const p of progress) {
    const tid = fcMap.get(p.flashcardId)
    if (!tid) continue
    const s = topicStats.get(tid) ?? { correct: 0, total: 0 }
    s.total++
    if (p.correct === true || p.correct === 1) s.correct++
    topicStats.set(tid, s)
  }
  const topicMap = new Map(topicList.map(t => [t.id, t.name]))
  return Array.from(topicStats.entries())
    .map(([tid, { correct, total }]) => ({
      topicId: tid,
      topicName: topicMap.get(tid) ?? tid,
      accuracy: Math.round((correct / total) * 100),
    }))
    .filter(t => t.accuracy < 60)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 4)
}

// ── React hook ───────────────────────────────────────────────────────────────

const DEFAULT: HomeStats = {
  listing: null,
  daysLeft: null,
  todayAccuracy: null,
  streakDays: 0,
  weakTopics: [],
  firstTopicId: null,
}

export function useHomeStats(): HomeStats {
  const db = useDb()
  const [stats, setStats] = useState<HomeStats>(DEFAULT)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const settingsRows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
      const slug = settingsRows[0]?.selectedListingSlug
      if (!slug) { if (!cancelled) setStats(DEFAULT); return }

      const [listingRows, allProgress, allFc, allTopics, firstTopicRows] = await Promise.all([
        db.select().from(listings).where(eq(listings.slug, slug)).limit(1),
        db.select({
          flashcardId: userProgress.flashcardId,
          correct: userProgress.correct,
          answeredAt: userProgress.answeredAt,
        }).from(userProgress),
        db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
        db.select({ id: topics.id, name: topics.name }).from(topics),
        db.select({ id: topics.id }).from(topics).limit(1),
      ])

      const listing = listingRows[0] ?? null
      const daysLeft = listing?.examDate
        ? Math.ceil((listing.examDate - Date.now()) / 86_400_000)
        : null

      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayRows = allProgress.filter(p => p.answeredAt >= todayStart.getTime())

      if (!cancelled) {
        setStats({
          listing: listing ? { title: listing.title, examDate: listing.examDate ?? null } : null,
          daysLeft,
          todayAccuracy: computeTodayAccuracy(todayRows),
          streakDays: computeStreak(allProgress),
          weakTopics: computeWeakTopics(allProgress, allFc, allTopics),
          firstTopicId: firstTopicRows[0]?.id ?? null,
        })
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db])

  return stats
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/mobile && pnpm jest --testPathPattern="hooks/__tests__/useHomeStats" --selectProjects=mobile
```

Expected: PASS — 10 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useHomeStats.ts apps/mobile/hooks/__tests__/useHomeStats.test.ts
git commit -m "feat(mobile): add useHomeStats hook with streak/accuracy/weak-topics logic"
```

---

## Task 3: usePracticeData hook

**Files:**
- Create: `apps/mobile/hooks/usePracticeData.ts`
- Create: `apps/mobile/hooks/__tests__/usePracticeData.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/hooks/__tests__/usePracticeData.test.ts`:

```ts
import { computeStrength } from '../usePracticeData'

const fcList = [
  { id: 'fc1', topicId: 't1' },
  { id: 'fc2', topicId: 't1' },
  { id: 'fc3', topicId: 't2' },
]

describe('computeStrength', () => {
  it('returns New with no progress', () => {
    expect(computeStrength('t1', [], fcList)).toBe('New')
  })

  it('returns Weak when accuracy < 50%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: false },
      { flashcardId: 'fc2', correct: false },
    ], fcList)).toBe('Weak')
  })

  it('returns Review when accuracy is 50%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: false },
    ], fcList)).toBe('Review')
  })

  it('returns Strong when accuracy >= 80%', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: true },
      { flashcardId: 'fc2', correct: true },
    ], fcList)).toBe('Strong')
  })

  it('handles SQLite numeric 0/1 for correct', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc1', correct: 1 },
      { flashcardId: 'fc2', correct: 0 },
    ], fcList)).toBe('Review')
  })

  it('ignores progress records for flashcards in other topics', () => {
    expect(computeStrength('t1', [
      { flashcardId: 'fc3', correct: true }, // fc3 belongs to t2, not t1
    ], fcList)).toBe('New')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd apps/mobile && pnpm jest --testPathPattern="hooks/__tests__/usePracticeData" --selectProjects=mobile
```

Expected: FAIL — `Cannot find module '../usePracticeData'`

- [ ] **Step 3: Implement `apps/mobile/hooks/usePracticeData.ts`**

```ts
import { useState, useEffect } from 'react'
import { useDb } from './useDb'
import { subjects, topics, flashcards, userProgress } from '../db/schema'

export type Strength = 'New' | 'Weak' | 'Review' | 'Strong'

export interface TopicRow {
  topic: { id: string; name: string; subjectId: string }
  cardCount: number
  lastPracticedAt: number | null
  accuracy: number | null
  strength: Strength
}

export interface PracticeData {
  subjects: Array<{ id: string; name: string }>
  topicRows: TopicRow[]
  selectedSubjectId: string | null
  setSelectedSubjectId: (id: string | null) => void
  totalCards: number
}

// ── Pure function (exported for unit tests) ──────────────────────────────────

export function computeStrength(
  topicId: string,
  progress: Array<{ flashcardId: string; correct: boolean | number }>,
  fcList: Array<{ id: string; topicId: string }>,
): Strength {
  const fcIds = new Set(fcList.filter(f => f.topicId === topicId).map(f => f.id))
  const tp = progress.filter(p => fcIds.has(p.flashcardId))
  if (tp.length === 0) return 'New'
  const correct = tp.filter(p => p.correct === true || p.correct === 1).length
  const acc = correct / tp.length
  if (acc >= 0.8) return 'Strong'
  if (acc >= 0.5) return 'Review'
  return 'Weak'
}

// ── React hook ───────────────────────────────────────────────────────────────

export function usePracticeData(): PracticeData {
  const db = useDb()
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null)
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [topicRows, setTopicRows] = useState<TopicRow[]>([])
  const [totalCards, setTotalCards] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [subjectRows, topicList, fcList, progressList] = await Promise.all([
        db.select().from(subjects),
        db.select().from(topics),
        db.select({ id: flashcards.id, topicId: flashcards.topicId }).from(flashcards),
        db.select({
          flashcardId: userProgress.flashcardId,
          correct: userProgress.correct,
          answeredAt: userProgress.answeredAt,
        }).from(userProgress),
      ])

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

      if (!cancelled) {
        setAllSubjects(subjectRows)
        setTopicRows(rows)
        setTotalCards(fcList.length)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [db, selectedSubjectId])

  return { subjects: allSubjects, topicRows, selectedSubjectId, setSelectedSubjectId, totalCards }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd apps/mobile && pnpm jest --testPathPattern="hooks/__tests__/usePracticeData" --selectProjects=mobile
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/usePracticeData.ts apps/mobile/hooks/__tests__/usePracticeData.test.ts
git commit -m "feat(mobile): add usePracticeData hook with strength computation"
```

---

## Task 4: Home screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Replace the stub with the full Home screen**

Replace the full contents of `apps/mobile/app/(tabs)/index.tsx`:

```tsx
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Gear1Outlined, Bolt2Outlined, SparkOutlined } from '@lineiconshq/free-icons'
import { useHomeStats } from '../../hooks/useHomeStats'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning ☀️'
  if (h < 18) return 'Good afternoon 🌤'
  return 'Good evening 🌙'
}

export default function HomeScreen() {
  const { listing, daysLeft, todayAccuracy, streakDays, weakTopics, firstTopicId } = useHomeStats()

  const quickTopicId = weakTopics[0]?.topicId ?? firstTopicId

  const kuyaMsg = listing
    ? weakTopics.length > 0
      ? `Kamusta! ${daysLeft ?? '?'} days na lang bago ang ${listing.title}. Mag-focus tayo sa ${weakTopics[0].topicName} ngayon — ito ang pinaka-mahina mo. Kaya mo 'yan! 💪`
      : `Kamusta! ${daysLeft ?? '?'} days na lang bago ang ${listing.title}. Magsimula na tayo! Kaya mo 'yan! 💪`
    : "Kamusta! Handa ka na ba? Simulan na natin ang pag-aaral! 💪"

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Greeting row */}
        <View style={s.greetRow}>
          <View>
            <Text style={s.greetTime}>{timeGreeting()}</Text>
            <Text style={s.greetName}>{listing?.title ?? 'Iskotify'}</Text>
          </View>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.push('/settings')}>
            <Lineicons icon={Gear1Outlined} size={16} color="rgba(255,255,255,0.62)" />
          </TouchableOpacity>
        </View>

        <View style={s.inner}>

          {/* Kuya Baw card */}
          <View style={s.kuyaCard}>
            <View style={s.kuyaHeader}>
              <View style={s.kuyaAvatar}>
                <Lineicons icon={SparkOutlined} size={13} color="#fff" />
              </View>
              <Text style={s.kuyaName}>Kuya Baw</Text>
              <View style={s.kuyaBadge}><Text style={s.kuyaBadgeText}>AI Coach</Text></View>
            </View>
            <Text style={s.kuyaText}>"{kuyaMsg}"</Text>
          </View>

          {/* Stats row */}
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fca5a5' }]}>{daysLeft ?? '—'}</Text>
              <Text style={s.statLbl}>DAYS LEFT</Text>
            </View>
            <View style={s.statCard}>
              <Text style={s.statVal}>{todayAccuracy !== null ? `${todayAccuracy}%` : '—'}</Text>
              <Text style={s.statLbl}>ACCURACY</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statVal, { color: '#fbbf24' }]}>{streakDays > 0 ? `${streakDays}🔥` : '—'}</Text>
              <Text style={s.statLbl}>STREAK</Text>
            </View>
          </View>

          {/* Quick Practice CTA */}
          {quickTopicId ? (
            <TouchableOpacity style={s.quickBtn} onPress={() => router.push(`/practice/${quickTopicId}`)}>
              <View style={s.quickIcon}>
                <Lineicons icon={Bolt2Outlined} size={15} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.quickTitle}>Quick Practice</Text>
                <Text style={s.quickSub}>
                  {weakTopics[0]?.topicName ?? 'Start a topic'} · recommended
                </Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </TouchableOpacity>
          ) : null}

          {/* Weak Areas */}
          <View style={s.secRow}>
            <Text style={s.secTitle}>Weak Areas</Text>
          </View>
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

        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#1a1a2e' },
  scroll: { paddingBottom: 100 },
  inner: { paddingHorizontal: 16 },
  greetRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  greetTime: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginBottom: 1, fontFamily: 'Lexend_400Regular' },
  greetName: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  iconBtn: { width: 30, height: 30, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center' },
  kuyaCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', borderRadius: 22, padding: 13, marginBottom: 8 },
  kuyaHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 7 },
  kuyaAvatar: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center' },
  kuyaName: { fontSize: 11, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  kuyaBadge: { marginLeft: 'auto', backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.30)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  kuyaBadgeText: { fontSize: 8, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  kuyaText: { fontSize: 11, color: 'rgba(255,255,255,0.78)', lineHeight: 17, fontFamily: 'Lexend_400Regular' },
  statsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, padding: 10, alignItems: 'center' },
  statVal: { fontSize: 16, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  statLbl: { fontSize: 8.5, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'Lexend_600SemiBold' },
  quickBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, shadowColor: '#800000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 16 },
  quickIcon: { width: 32, height: 32, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  quickSub: { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  chevron: { color: 'rgba(255,255,255,0.45)', fontSize: 22 },
  secRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7, marginTop: 8 },
  secTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 10, fontWeight: '600', color: '#f87171', fontFamily: 'Lexend_600SemiBold' },
  empty: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/'(tabs)'/index.tsx
git commit -m "feat(mobile): implement Home screen with Kuya Baw, stats, weak areas"
```

---

## Task 5: Practice Hub screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Replace the stub with the full Practice Hub**

Replace the full contents of `apps/mobile/app/(tabs)/practice.tsx`:

```tsx
import { StyleSheet, View, Text, TouchableOpacity, FlatList } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { usePracticeData, type Strength, type TopicRow } from '../../hooks/usePracticeData'
import { useHomeStats } from '../../hooks/useHomeStats'

const STRENGTH_COLOR: Record<Strength, { bg: string; border: string; text: string; iconBg: string; iconColor: string }> = {
  New:    { bg: 'rgba(128,0,0,0.10)',    border: 'rgba(128,0,0,0.25)',    text: '#fca5a5', iconBg: 'rgba(128,0,0,0.10)',    iconColor: '#fca5a5' },
  Weak:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)',  text: '#f87171', iconBg: 'rgba(239,68,68,0.10)',  iconColor: '#f87171' },
  Review: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)', text: '#fbbf24', iconBg: 'rgba(245,158,11,0.08)', iconColor: '#fbbf24' },
  Strong: { bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)',  text: '#4ade80', iconBg: 'rgba(34,197,94,0.08)',  iconColor: '#4ade80' },
}

function lastPracticedLabel(ts: number | null): string {
  if (!ts) return 'Never'
  const diff = Date.now() - ts
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

function TopicCard({ row }: { row: TopicRow }) {
  const c = STRENGTH_COLOR[row.strength]
  return (
    <TouchableOpacity style={s.topicCard} onPress={() => router.push(`/practice/${row.topic.id}`)}>
      <View style={[s.topicIcon, { backgroundColor: c.iconBg }]}>
        <Text style={{ color: c.iconColor, fontSize: 15 }}>📖</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.topicName} numberOfLines={1}>{row.topic.name}</Text>
        <Text style={s.topicSub}>{row.cardCount} cards · {lastPracticedLabel(row.lastPracticedAt)}</Text>
      </View>
      <View style={[s.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
        <Text style={[s.badgeText, { color: c.text }]}>{row.strength}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function PracticeScreen() {
  const { subjects, topicRows, selectedSubjectId, setSelectedSubjectId, totalCards } = usePracticeData()
  const { listing } = useHomeStats()

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Practice</Text>
        <Text style={s.subtitle}>{listing?.title ?? '—'} · {totalCards} cards synced</Text>
      </View>

      {/* Subject filter chips — flex-wrap, no scroll */}
      <View style={s.chips}>
        <TouchableOpacity onPress={() => setSelectedSubjectId(null)}>
          <View style={[s.chip, !selectedSubjectId && s.chipOn]}>
            <Text style={[s.chipTxt, !selectedSubjectId && s.chipTxtOn]}>All</Text>
          </View>
        </TouchableOpacity>
        {subjects.map(sub => (
          <TouchableOpacity key={sub.id} onPress={() => setSelectedSubjectId(sub.id)}>
            <View style={[s.chip, selectedSubjectId === sub.id && s.chipOn]}>
              <Text style={[s.chipTxt, selectedSubjectId === sub.id && s.chipTxtOn]}>{sub.name}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.secRow}>
        <Text style={s.secTitle}>Topics</Text>
        <Text style={s.sortLink}>Sort</Text>
      </View>

      <FlatList
        data={topicRows}
        keyExtractor={r => r.topic.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <TopicCard row={item} />}
        ListEmptyComponent={<Text style={s.empty}>No topics found. Try syncing again.</Text>}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  chips: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  chipOn: { backgroundColor: 'rgba(128,0,0,0.82)', borderColor: 'transparent' },
  chipTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_600SemiBold' },
  chipTxtOn: { color: '#fff' },
  secRow: { paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  secTitle: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  sortLink: { fontSize: 10, color: '#fca5a5', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  topicCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  topicIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  topicName: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold', marginBottom: 1 },
  topicSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, flexShrink: 0 },
  badgeText: { fontSize: 9, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  empty: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 32 },
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/'(tabs)'/practice.tsx
git commit -m "feat(mobile): implement Practice Hub screen with subject filter and strength badges"
```

---

## Task 6: Flashcard Engine

**Files:**
- Create: `apps/mobile/app/practice/[topicId].tsx`

- [ ] **Step 1: Create the directory and file**

Create `apps/mobile/app/practice/[topicId].tsx` with the full contents:

```tsx
import { useState, useEffect } from 'react'
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { flashcards as flashcardsTable, topics, userProgress } from '../../db/schema'

interface Card { id: string; question: string; answer: string; explanation: string; difficulty: number }
interface Result { flashcardId: string; correct: boolean }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const DIFF: Record<number, { label: string; color: string; bg: string; border: string }> = {
  1: { label: 'Easy',   color: '#4ade80', bg: 'rgba(34,197,94,0.10)',  border: 'rgba(34,197,94,0.22)'  },
  2: { label: 'Medium', color: '#fbbf24', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.22)' },
  3: { label: 'Hard',   color: '#f87171', bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.22)'  },
}

export default function FlashcardScreen() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>()
  const db = useDb()

  const [topicName, setTopicName] = useState('')
  const [cards, setCards] = useState<Card[]>([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const [topicRows, cardRows] = await Promise.all([
        db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId)).limit(1),
        db.select({
          id: flashcardsTable.id,
          question: flashcardsTable.question,
          answer: flashcardsTable.answer,
          explanation: flashcardsTable.explanation,
          difficulty: flashcardsTable.difficulty,
        }).from(flashcardsTable).where(eq(flashcardsTable.topicId, topicId)),
      ])
      setTopicName(topicRows[0]?.name ?? 'Topic')
      setCards(shuffle(cardRows))
    }
    void load()
  }, [db, topicId])

  function handleAnswer(correct: boolean) {
    const card = cards[idx]
    const newResults = [...results, { flashcardId: card.id, correct }]
    if (idx === cards.length - 1) {
      const now = Date.now()
      db.transaction(tx => {
        for (const r of newResults) {
          tx.insert(userProgress)
            .values({ flashcardId: r.flashcardId, correct: r.correct, answeredAt: now })
            .run()
        }
      })
      setResults(newResults)
      setDone(true)
    } else {
      setResults(newResults)
      setIdx(i => i + 1)
      setFlipped(false)
    }
  }

  function handlePracticeAgain() {
    setCards(c => shuffle(c))
    setIdx(0)
    setFlipped(false)
    setResults([])
    setDone(false)
  }

  if (cards.length === 0) {
    return (
      <SafeAreaView style={s.root}>
        <Text style={s.loading}>Loading cards…</Text>
      </SafeAreaView>
    )
  }

  if (done) {
    const correct = results.filter(r => r.correct).length
    const accuracy = Math.round((correct / results.length) * 100)
    return (
      <SafeAreaView style={s.root}>
        <View style={s.resultsWrap}>
          <Text style={s.resultPct}>{accuracy}%</Text>
          <Text style={s.resultTitle}>Session Complete</Text>
          <View style={s.resultCounts}>
            <View style={s.resultCount}>
              <Text style={[s.resultNum, { color: '#4ade80' }]}>{correct}</Text>
              <Text style={s.resultLbl}>Correct</Text>
            </View>
            <View style={s.resultCount}>
              <Text style={[s.resultNum, { color: '#f87171' }]}>{results.length - correct}</Text>
              <Text style={s.resultLbl}>Wrong</Text>
            </View>
          </View>
          <TouchableOpacity style={s.primaryBtn} onPress={handlePracticeAgain}>
            <Text style={s.primaryBtnTxt}>Practice Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
            <Text style={s.ghostBtnTxt}>Back to Topics</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const card = cards[idx]
  const diff = DIFF[card.difficulty] ?? DIFF[2]

  return (
    <SafeAreaView style={s.root}>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={s.topicTitle} numberOfLines={1}>{topicName}</Text>
        <Text style={s.counter}>{idx + 1} / {cards.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={s.progBg}>
        <View style={[s.progFill, { width: `${((idx + 1) / cards.length) * 100}%` as any }]} />
      </View>

      {/* Card */}
      <TouchableOpacity
        style={s.card}
        onPress={() => { if (!flipped) setFlipped(true) }}
        activeOpacity={flipped ? 1 : 0.8}
      >
        <Text style={s.cardLabel}>{flipped ? 'ANSWER' : 'QUESTION'}</Text>
        <Text style={s.cardText}>{flipped ? card.answer : card.question}</Text>
        {flipped && card.explanation ? (
          <Text style={s.cardExpl}>{card.explanation}</Text>
        ) : null}
        {!flipped ? <Text style={s.tapHint}>Tap to reveal answer</Text> : null}
      </TouchableOpacity>

      {/* Difficulty chip */}
      <View style={s.diffRow}>
        <View style={[s.diffChip, { backgroundColor: diff.bg, borderColor: diff.border }]}>
          <Text style={[s.diffText, { color: diff.color }]}>{diff.label} difficulty</Text>
        </View>
      </View>

      {/* Correct / Wrong buttons — only after flip */}
      {flipped ? (
        <View style={s.actions}>
          <TouchableOpacity style={[s.actionBtn, s.wrongBtn]} onPress={() => handleAnswer(false)}>
            <Text style={[s.actionTxt, { color: '#f87171' }]}>✕  Wrong</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, s.correctBtn]} onPress={() => handleAnswer(true)}>
            <Text style={[s.actionTxt, { color: '#4ade80' }]}>✓  Correct</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ height: 56 }} />
      )}

    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  loading: { color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 26, lineHeight: 30 },
  topicTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  counter: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  progBg: { marginHorizontal: 14, height: 3, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99, marginBottom: 12 },
  progFill: { height: 3, backgroundColor: '#800000', borderRadius: 99 },
  card: { marginHorizontal: 14, marginBottom: 10, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 22, minHeight: 200, alignItems: 'center', justifyContent: 'center' },
  cardLabel: { fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 10, fontFamily: 'Lexend_600SemiBold', fontWeight: '600' },
  cardText: { fontSize: 15, fontWeight: '600', color: '#fff', textAlign: 'center', lineHeight: 22, fontFamily: 'Outfit_600SemiBold' },
  cardExpl: { fontSize: 11, color: 'rgba(255,255,255,0.60)', textAlign: 'center', marginTop: 10, lineHeight: 16, fontFamily: 'Lexend_400Regular' },
  tapHint: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 14, fontFamily: 'Lexend_400Regular' },
  diffRow: { alignItems: 'center', marginBottom: 12 },
  diffChip: { borderWidth: 1, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
  diffText: { fontSize: 10, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 14 },
  actionBtn: { flex: 1, borderRadius: 16, padding: 13, alignItems: 'center', justifyContent: 'center' },
  actionTxt: { fontSize: 12, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  wrongBtn: { backgroundColor: 'rgba(239,68,68,0.10)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.22)' },
  correctBtn: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
  resultsWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  resultPct: { fontSize: 56, fontWeight: '700', color: '#fca5a5', letterSpacing: -2, fontFamily: 'Outfit_700Bold', marginBottom: 4 },
  resultTitle: { fontSize: 14, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular', marginBottom: 24 },
  resultCounts: { flexDirection: 'row', gap: 32, marginBottom: 32 },
  resultCount: { alignItems: 'center' },
  resultNum: { fontSize: 28, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  resultLbl: { fontSize: 10, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
  primaryBtn: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 16, paddingVertical: 13, paddingHorizontal: 32, marginBottom: 10, width: '100%', alignItems: 'center', shadowColor: '#800000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
  primaryBtnTxt: { fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: 12, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular' },
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/practice/[topicId].tsx"
git commit -m "feat(mobile): implement Flashcard Engine with flip, correct/wrong, inline results"
```

---

## Task 7: Listings Hub screen

**Files:**
- Modify: `apps/mobile/app/(tabs)/listings.tsx`

- [ ] **Step 1: Replace the stub with the full Listings Hub**

Replace the full contents of `apps/mobile/app/(tabs)/listings.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react'
import { StyleSheet, View, Text, FlatList, TouchableOpacity, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { GraduationCap1Outlined, SparkOutlined, Funnel1Outlined } from '@lineiconshq/free-icons'
import { useDb } from '../../hooks/useDb'
import { listings as listingsTable } from '../../db/schema'

type Segment = 'all' | 'exam' | 'scholarship'

interface ListingRow {
  id: string; slug: string; title: string; type: string; status: string; examDate: number | null
}

function fmtDate(ts: number | null): string {
  if (!ts) return 'Date TBA'
  return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ListingsScreen() {
  const db = useDb()
  const [all, setAll] = useState<ListingRow[]>([])
  const [segment, setSegment] = useState<Segment>('all')
  const [query, setQuery] = useState('')

  useEffect(() => {
    db.select().from(listingsTable).then(rows => setAll(rows))
  }, [db])

  const filtered = useMemo(() => {
    return all
      .filter(l => segment === 'all' || l.type === segment)
      .filter(l => l.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => {
        if (!a.examDate) return 1
        if (!b.examDate) return -1
        return a.examDate - b.examDate
      })
  }, [all, segment, query])

  const isExam = (l: ListingRow) => l.type === 'exam'

  return (
    <SafeAreaView style={s.root}>

      <View style={s.header}>
        <Text style={s.title}>Listings</Text>
        <Text style={s.subtitle}>Exams & Scholarships</Text>
      </View>

      {/* Segment control */}
      <View style={s.seg}>
        {(['all', 'exam', 'scholarship'] as Segment[]).map(seg => (
          <TouchableOpacity key={seg} style={[s.segBtn, segment === seg && s.segBtnOn]} onPress={() => setSegment(seg)}>
            <Text style={[s.segTxt, segment === seg && s.segTxtOn]}>
              {seg === 'all' ? 'All' : seg === 'exam' ? 'Exams' : 'Scholarships'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search + filter */}
      <View style={s.searchRow}>
        <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)' }}>🔍</Text>
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          placeholderTextColor="rgba(255,255,255,0.38)"
        />
        <View style={s.searchDivider} />
        <TouchableOpacity>
          <Lineicons icon={Funnel1Outlined} size={13} color="rgba(255,255,255,0.62)" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={s.empty}>No listings found.</Text>}
        renderItem={({ item: l }) => {
          const exam = isExam(l)
          return (
            <View style={s.card}>
              <View style={[s.cardIcon, exam ? s.examIcon : s.scholarIcon]}>
                <Lineicons
                  icon={exam ? GraduationCap1Outlined : SparkOutlined}
                  size={16}
                  color={exam ? '#fca5a5' : '#4ade80'}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.row1}>
                  <Text style={s.cardTitle} numberOfLines={1}>{l.title}</Text>
                  <View style={[s.typeBadge, exam ? s.examBadge : s.scholarBadge]}>
                    <Text style={[s.typeTxt, { color: exam ? '#fca5a5' : '#4ade80' }]}>
                      {exam ? 'Exam' : 'Scholar'}
                    </Text>
                  </View>
                </View>
                <View style={s.row2}>
                  <Text style={s.dateText}>{fmtDate(l.examDate)}</Text>
                  <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.30)' }}>🔖</Text>
                </View>
              </View>
            </View>
          )
        }}
      />
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  seg: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 10, padding: 3, gap: 2, marginHorizontal: 16, marginBottom: 8 },
  segBtn: { flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: 'rgba(128,0,0,0.82)' },
  segTxt: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_600SemiBold' },
  segTxtOn: { color: '#fff' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, paddingHorizontal: 11, paddingVertical: 8, marginHorizontal: 16, marginBottom: 9 },
  searchInput: { flex: 1, fontSize: 11, color: '#fff', fontFamily: 'Lexend_400Regular', padding: 0 },
  searchDivider: { width: 1, height: 13, backgroundColor: 'rgba(255,255,255,0.20)' },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  examIcon: { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)' },
  scholarIcon: { backgroundColor: 'rgba(34,197,94,0.10)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.22)' },
  row1: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  typeBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, flexShrink: 0 },
  examBadge: { backgroundColor: 'rgba(128,0,0,0.12)', borderColor: 'rgba(128,0,0,0.25)' },
  scholarBadge: { backgroundColor: 'rgba(34,197,94,0.10)', borderColor: 'rgba(34,197,94,0.22)' },
  typeTxt: { fontSize: 8.5, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  row2: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dateText: { flex: 1, fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  empty: { textAlign: 'center', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', fontSize: 11, marginTop: 32 },
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/'(tabs)'/listings.tsx
git commit -m "feat(mobile): implement Listings Hub with segment filter, search, and type-tinted cards"
```

---

## Task 8: Settings screen

**Files:**
- Create: `apps/mobile/app/settings.tsx`

- [ ] **Step 1: Create `apps/mobile/app/settings.tsx`**

```tsx
import { useState, useEffect } from 'react'
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

const version = Constants.expoConfig?.version ?? '1.0.0'

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
      <Text style={[s.rowLabel, disabled && { color: 'rgba(255,255,255,0.38)' }]}>{label}</Text>
      <Text style={s.rowChevron}>›</Text>
    </TouchableOpacity>
  )
}

export default function SettingsScreen() {
  const db = useDb()
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

  return (
    <SafeAreaView style={s.root}>
      {/* Back button */}
      <View style={s.backRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Text style={s.backArrow}>‹</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Title + version badge */}
        <Text style={s.pageTitle}>Settings</Text>
        <View style={s.versionBadge}>
          <Text style={s.versionApp}>Iskotify</Text>
          <View style={s.versionDot} />
          <Text style={s.versionNum}>v{version}</Text>
        </View>

        {/* Profile card */}
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

        {/* App section */}
        <Text style={s.secLabel}>App</Text>
        <SettingsRow
          icon={SparkOutlined}
          iconBg="rgba(128,0,0,0.12)"
          iconColor="#fca5a5"
          label="About Iskotify"
          onPress={() => Alert.alert('Iskotify', `Version ${version}\n\nYour ultimate UPCAT & scholarship companion.`)}
        />
        <SettingsRow
          icon={QuestionMarkCircleOutlined}
          iconBg="rgba(96,165,250,0.12)"
          iconColor="#60a5fa"
          label="Help & Support"
          onPress={() => Alert.alert('Help', 'Support docs coming soon.')}
        />
        <SettingsRow
          icon={Shield2Outlined}
          iconBg="rgba(245,158,11,0.10)"
          iconColor="#fbbf24"
          label="Privacy & Terms"
          onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')}
        />

        {/* Data section */}
        <Text style={s.secLabel}>Data</Text>
        <SettingsRow
          icon={Download1Outlined}
          iconBg="rgba(34,197,94,0.10)"
          iconColor="#4ade80"
          label="Export Data"
          onPress={handleExport}
        />

        {/* Appearance section */}
        <Text style={s.secLabel}>Appearance</Text>
        <View style={[s.row, { opacity: 0.5 }]}>
          <View style={[s.rowIcon, { backgroundColor: 'rgba(255,255,255,0.07)' }]}>
            <Lineicons icon={Brush2Outlined} size={13} color="rgba(255,255,255,0.4)" />
          </View>
          <Text style={[s.rowLabel, { color: 'rgba(255,255,255,0.38)' }]}>Theme</Text>
          <View style={s.soonChip}><Text style={s.soonTxt}>Coming soon</Text></View>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  backRow: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 4, paddingBottom: 4 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 28, lineHeight: 32 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  versionBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.25)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 16 },
  versionApp: { fontSize: 9, fontWeight: '700', color: '#fca5a5', fontFamily: 'Outfit_700Bold' },
  versionDot: { width: 3, height: 3, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 99 },
  versionNum: { fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  profileCard: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  profileAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center' },
  profileName: { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  profileSub: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  secLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)', marginBottom: 5, marginTop: 12, fontFamily: 'Lexend_600SemiBold' },
  row: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 16, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 4 },
  rowIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 11, fontWeight: '500', color: '#fff', fontFamily: 'Lexend_500Medium' },
  rowChevron: { color: 'rgba(255,255,255,0.38)', fontSize: 18 },
  soonChip: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  soonTxt: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_600SemiBold' },
})
```

- [ ] **Step 2: Type-check**

```bash
cd apps/mobile && pnpm type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/settings.tsx
git commit -m "feat(mobile): implement Settings screen with About, Help, Privacy, Export, Theme-soon"
```

---

## Task 9: Profile screen design polish

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Apply design system to the existing profile screen**

Replace the full contents of `apps/mobile/app/(tabs)/profile.tsx` (keep all existing logic, only update styles):

```tsx
import { StyleSheet, View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useDb } from '../../hooks/useDb'
import { exportUserData } from '../../services/export'
import { userSettings } from '../../db/schema'

export default function ProfileScreen() {
  const db = useDb()

  function handleChangeExam() {
    Alert.alert(
      'Change Exam',
      'This will clear your current selection and restart onboarding.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.update(userSettings)
                .set({ selectedListingSlug: '', lastSyncedAt: 0 })
                .where(eq(userSettings.id, 1))
              router.replace('/onboarding')
            } catch {
              Alert.alert('Error', 'Could not reset your selection. Please try again.')
            }
          },
        },
      ]
    )
  }

  async function handleExport() {
    try {
      await exportUserData(db)
    } catch {
      Alert.alert('Export Failed', 'Could not export data. Please try again.')
    }
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.inner}>
        <Text style={s.title}>Profile</Text>
        <TouchableOpacity onPress={handleChangeExam} style={s.card}>
          <Text style={s.cardTitle}>Change Exam</Text>
          <Text style={s.cardSub}>Select a different exam to study for</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleExport} style={s.card}>
          <Text style={s.cardTitle}>Export Data</Text>
          <Text style={s.cardSub}>Save your preferences as a JSON file</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  inner: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold', marginBottom: 20 },
  card: { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 16, marginBottom: 10 },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  cardSub: { fontSize: 11, color: 'rgba(255,255,255,0.50)', marginTop: 3, fontFamily: 'Lexend_400Regular' },
})
```

- [ ] **Step 2: Type-check and run all tests**

```bash
cd apps/mobile && pnpm type-check && pnpm jest --selectProjects=mobile
```

Expected: type-check passes; all mobile tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/'(tabs)'/profile.tsx
git commit -m "feat(mobile): polish Profile screen with design system fonts and card styles"
```
