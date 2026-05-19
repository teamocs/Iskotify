# Multi-Focus Listings, Sessions & Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-listing focus management (select multiple exams/scholarships with priority ordering), session recording for every completed quiz, an Analytics tab showing progress over time, and surface focus context across Practice, Listings, and Profile screens.

**Architecture:** Bottom-up from data layer through hooks through screens. Two new SQLite tables (`focus_listings`, `practice_sessions`). Existing `userSettings.selectedListingSlug` kept in sync with the priority-1 focus entry. Session recording is a pure side-effect in quiz `advance()` calls. Analytics is computed entirely in JavaScript from local DB rows—no extra server calls.

**Tech Stack:** Drizzle ORM + expo-sqlite, expo-router, React Native (no new native modules), TypeScript, @lineiconshq/react-native-lineicons, jest-expo

---

## File Map

| Status | Path | Purpose |
|--------|------|---------|
| Modify | `apps/mobile/db/schema.ts` | Add `focusListings` and `practiceSessions` table definitions |
| Modify | `apps/mobile/db/client.ts` | Add CREATE TABLE migrations + seed migration |
| Modify | `apps/mobile/services/sync.ts` | Export `syncPrimaryListing`; refactor `syncOnLaunch` for multi-slug |
| Modify | `apps/mobile/hooks/usePracticeData.ts` | Add `topicIdsByListingSlug` to returned data |
| **Create** | `apps/mobile/hooks/useFocusListings.ts` | CRUD + reorder hook for focus_listings table |
| **Create** | `apps/mobile/hooks/useRecordSession.ts` | Insert a row into practice_sessions on quiz completion |
| **Create** | `apps/mobile/hooks/useAnalytics.ts` | Compute all analytics metrics from local DB |
| Modify | `apps/mobile/components/TabBar.tsx` | Add 5th Analytics tab; widen blur container |
| Modify | `apps/mobile/app/(tabs)/_layout.tsx` | Register analytics screen |
| **Create** | `apps/mobile/app/(tabs)/analytics.tsx` | Analytics screen (placeholder Task 7, full Task 16) |
| Modify | `apps/mobile/app/onboarding.tsx` | Multi-select step 2; focus summary on assessDone |
| Modify | `apps/mobile/app/(tabs)/practice.tsx` | Focus cards row + Quick Start section |
| **Create** | `apps/mobile/app/practice/listing/[slug].tsx` | Virtual deck quiz (full review / weak only) |
| Modify | `apps/mobile/app/practice/[topicId].tsx` | Record session on quiz completion |
| Modify | `apps/mobile/app/practice/deck/[deckId].tsx` | Record session on quiz completion |
| Modify | `apps/mobile/app/(tabs)/listings.tsx` | Show focus badge on each card |
| Modify | `apps/mobile/app/listings/[slug].tsx` | Add/Remove Focus CTA block |
| Modify | `apps/mobile/app/(tabs)/profile.tsx` | Replace "Change Exam" with My Focus List section |
| Modify | `apps/mobile/app/(tabs)/index.tsx` | Mini progress card linking to Analytics |
| **Create** | `apps/mobile/hooks/__tests__/useFocusListings.test.ts` | Pure-function tests |
| **Create** | `apps/mobile/hooks/__tests__/useRecordSession.test.ts` | Pure-function tests |
| **Create** | `apps/mobile/hooks/__tests__/useAnalytics.test.ts` | Pure-function tests |

---

## Task 1: DB Schema + Migrations

**Files:**
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`

- [ ] **Step 1: Add table definitions to schema.ts**

Append after the `savedDecks` table at the bottom of `apps/mobile/db/schema.ts`:

```ts
export const focusListings = sqliteTable('focus_listings', {
  listingSlug: text('listing_slug').primaryKey(),
  priority:    integer('priority').notNull(),
  addedAt:     integer('added_at').notNull(),
})

export const practiceSessions = sqliteTable('practice_sessions', {
  id:           integer('id').primaryKey({ autoIncrement: true }),
  listingSlug:  text('listing_slug').notNull().default(''),
  topicId:      text('topic_id').notNull().default(''),
  deckId:       text('deck_id').notNull().default(''),
  score:        integer('score').notNull().default(0),
  total:        integer('total').notNull().default(0),
  durationSecs: integer('duration_secs').notNull().default(0),
  completedAt:  integer('completed_at').notNull(),
})
```

- [ ] **Step 2: Add migrations to client.ts**

Append 3 new strings to the `MIGRATIONS` array in `apps/mobile/db/client.ts` (after the last `ALTER TABLE listings ADD COLUMN grant_amount` entry):

```ts
  `CREATE TABLE IF NOT EXISTS focus_listings (
    listing_slug TEXT PRIMARY KEY NOT NULL,
    priority INTEGER NOT NULL,
    added_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    listing_slug TEXT NOT NULL DEFAULT '',
    topic_id TEXT NOT NULL DEFAULT '',
    deck_id TEXT NOT NULL DEFAULT '',
    score INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL DEFAULT 0,
    duration_secs INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER NOT NULL
  )`,
  `INSERT OR IGNORE INTO focus_listings (listing_slug, priority, added_at)
   SELECT selected_listing_slug, 1, (strftime('%s','now') * 1000)
   FROM user_settings WHERE id = 1 AND selected_listing_slug != ''`,
```

The try/catch wrapper around each migration handles the CREATE TABLE IF NOT EXISTS and INSERT OR IGNORE idiomatically — neither will throw.

- [ ] **Step 3: Verify type-check passes**

```
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors referencing `focusListings` or `practiceSessions`.

- [ ] **Step 4: Commit**

```
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(db): add focus_listings and practice_sessions tables with seed migration"
```

---

## Task 2: Sync Service Refactor

**Files:**
- Modify: `apps/mobile/services/sync.ts`

- [ ] **Step 1: Replace sync.ts entirely**

```ts
import { eq, asc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { subjects, topics, flashcards, listings, userSettings, focusListings } from '../db/schema'
import { supabase } from './supabase'

export async function syncPrimaryListing(db: DrizzleClient): Promise<void> {
  const rows = await db
    .select({ listingSlug: focusListings.listingSlug })
    .from(focusListings)
    .orderBy(asc(focusListings.priority))
    .limit(1)
  const slug = rows[0]?.listingSlug ?? ''
  await db.update(userSettings)
    .set({ selectedListingSlug: slug })
    .where(eq(userSettings.id, 1))
}

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  try {
    const [settingsRows, focusRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
      db.select().from(focusListings).orderBy(asc(focusListings.priority)),
    ])
    const settings = settingsRows[0]
    if (!settings) return

    let slugs = focusRows.map(r => r.listingSlug)
    if (slugs.length === 0 && settings.selectedListingSlug) slugs = [settings.selectedListingSlug]
    if (slugs.length === 0) return

    const since = settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()

    const [listingsRes, subjectsRes, topicsRes] = await Promise.all([
      supabase.from('listings')
        .select('id,slug,title,type,status,exam_date,region,description,requirements,coverage,provider,external_url,deadline,grant_amount')
        .gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
    ])

    const cardResults = await Promise.all(
      slugs.map(slug =>
        supabase.from('flashcards')
          .select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,updated_at')
          .contains('listing_slugs', [slug])
          .eq('status', 'published')
          .gt('updated_at', since)
      )
    )

    const seen = new Set<string>()
    const allCards = cardResults.flatMap(r => r.data ?? []).filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id); return true
    })

    db.transaction((tx) => {
      for (const row of (listingsRes.data ?? [])) {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        const deadline = row.deadline ? new Date(row.deadline).getTime() : null
        const vals = {
          id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status,
          examDate, region: row.region ?? '', description: row.description ?? '',
          requirements: JSON.stringify(row.requirements ?? []), coverage: row.coverage ?? '',
          provider: row.provider ?? '', externalUrl: row.external_url ?? '', deadline,
          grantAmount: row.grant_amount != null ? String(row.grant_amount) : '',
        }
        tx.insert(listings).values(vals).onConflictDoUpdate({ target: listings.id, set: vals }).run()
      }

      for (const row of (subjectsRes.data ?? [])) {
        tx.insert(subjects).values({ id: row.id, name: row.name })
          .onConflictDoUpdate({ target: subjects.id, set: { name: row.name } }).run()
      }

      for (const row of (topicsRes.data ?? [])) {
        tx.insert(topics)
          .values({ id: row.id, name: row.name, subjectId: row.subject_id, status: row.status })
          .onConflictDoUpdate({ target: topics.id, set: { name: row.name, subjectId: row.subject_id, status: row.status } })
          .run()
      }

      for (const row of allCards) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        const vals = {
          id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
          explanation: row.explanation, difficulty: row.difficulty,
          listingSlugs: JSON.stringify(row.listing_slugs ?? []), remoteUpdatedAt,
        }
        tx.insert(flashcards).values(vals).onConflictDoUpdate({ target: flashcards.id, set: vals }).run()
      }

      const syncedAt = Date.now()
      tx.insert(userSettings)
        .values({ id: 1, selectedListingSlug: slugs[0]!, lastSyncedAt: syncedAt })
        .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: syncedAt, selectedListingSlug: slugs[0]! } })
        .run()
    })
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
```

- [ ] **Step 2: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add apps/mobile/services/sync.ts
git commit -m "feat(sync): support multi-slug focus list; export syncPrimaryListing"
```

---

## Task 3: usePracticeData — topicIdsByListingSlug

**Files:**
- Modify: `apps/mobile/hooks/usePracticeData.ts`

- [ ] **Step 1: Add field to PracticeData interface**

In `apps/mobile/hooks/usePracticeData.ts`, add `topicIdsByListingSlug` to the `PracticeData` interface:

```ts
export interface PracticeData {
  subjects: Array<{ id: string; name: string }>
  topicRows: TopicRow[]
  recommendedTopics: TopicRow[]
  selectedSubjectId: string | null
  setSelectedSubjectId: (id: string | null) => void
  totalCards: number
  cardCountByTopic: Record<string, number>
  topicIdsByListingSlug: Record<string, string[]>   // NEW
}
```

- [ ] **Step 2: Compute topicIdsByListingSlug in the load function**

After the line `const slug = settingsRows[0]?.selectedListingSlug ?? ''` (around line 78), add:

```ts
        // Build mapping: listingSlug → topicIds derived from flashcard tags
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
```

- [ ] **Step 3: Add state + expose in return**

Add state: `const [topicIdsByListingSlug, setTopicIdsByListingSlug] = useState<Record<string, string[]>>({})` with the other useState calls.

Inside the `if (!cancelled)` block, add: `setTopicIdsByListingSlug(topicIdsBySlug)`

Update the return statement to include: `topicIdsByListingSlug`

- [ ] **Step 4: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/usePracticeData.ts
git commit -m "feat(hooks): expose topicIdsByListingSlug from usePracticeData"
```

---

## Task 4: useFocusListings Hook (TDD)

**Files:**
- Create: `apps/mobile/hooks/__tests__/useFocusListings.test.ts`
- Create: `apps/mobile/hooks/useFocusListings.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/hooks/__tests__/useFocusListings.test.ts`:

```ts
import { normalizePriorities, swapPriority } from '../useFocusListings'

const make = (overrides: Partial<{ slug: string; priority: number; addedAt: number; title: string; type: string }> = {}) => ({
  slug: 'upcat-2025',
  priority: 1,
  addedAt: 1000,
  title: 'UPCAT 2025',
  type: 'exam',
  ...overrides,
})

describe('normalizePriorities', () => {
  it('assigns sequential 1-based priorities sorted by current priority', () => {
    const input = [make({ slug: 'b', priority: 3 }), make({ slug: 'a', priority: 1 })]
    const result = normalizePriorities(input)
    expect(result[0]!.slug).toBe('a')
    expect(result[0]!.priority).toBe(1)
    expect(result[1]!.slug).toBe('b')
    expect(result[1]!.priority).toBe(2)
  })

  it('returns empty array for empty input', () => {
    expect(normalizePriorities([])).toEqual([])
  })
})

describe('swapPriority', () => {
  const rows = [
    make({ slug: 'a', priority: 1 }),
    make({ slug: 'b', priority: 2 }),
    make({ slug: 'c', priority: 3 }),
  ]

  it('moves item up', () => {
    const result = swapPriority(rows, 'b', 'up')
    expect(result[0]!.slug).toBe('b')
    expect(result[1]!.slug).toBe('a')
  })

  it('moves item down', () => {
    const result = swapPriority(rows, 'b', 'down')
    expect(result[1]!.slug).toBe('c')
    expect(result[2]!.slug).toBe('b')
  })

  it('is noop when moving first item up', () => {
    const result = swapPriority(rows, 'a', 'up')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })

  it('is noop when moving last item down', () => {
    const result = swapPriority(rows, 'c', 'down')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })

  it('is noop when slug not found', () => {
    const result = swapPriority(rows, 'x', 'up')
    expect(result.map(r => r.slug)).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL (module not found)**

```
cd apps/mobile && npx jest hooks/__tests__/useFocusListings.test.ts
```

Expected: `Cannot find module '../useFocusListings'`

- [ ] **Step 3: Create useFocusListings.ts**

Create `apps/mobile/hooks/useFocusListings.ts`:

```ts
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { eq, asc } from 'drizzle-orm'
import { useDb } from './useDb'
import { focusListings, listings } from '../db/schema'

export interface FocusListing {
  slug: string
  priority: number
  addedAt: number
  title: string
  type: string
}

export function normalizePriorities(rows: FocusListing[]): FocusListing[] {
  return [...rows]
    .sort((a, b) => a.priority - b.priority)
    .map((r, i) => ({ ...r, priority: i + 1 }))
}

export function swapPriority(rows: FocusListing[], slug: string, direction: 'up' | 'down'): FocusListing[] {
  const idx = rows.findIndex(r => r.slug === slug)
  if (idx === -1) return rows
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= rows.length) return rows
  const next = rows.map(r => ({ ...r }))
  const tmp = next[idx]!.priority
  next[idx]!.priority = next[swapIdx]!.priority
  next[swapIdx]!.priority = tmp
  return normalizePriorities(next)
}

export function useFocusListings() {
  const db = useDb()
  const [focusListingsList, setFocusListingsList] = useState<FocusListing[]>([])

  const load = useCallback(async () => {
    const rows = await db
      .select({
        slug: focusListings.listingSlug,
        priority: focusListings.priority,
        addedAt: focusListings.addedAt,
        title: listings.title,
        type: listings.type,
      })
      .from(focusListings)
      .leftJoin(listings, eq(listings.slug, focusListings.listingSlug))
      .orderBy(asc(focusListings.priority))
    setFocusListingsList(rows.map(r => ({
      slug: r.slug,
      priority: r.priority,
      addedAt: r.addedAt,
      title: r.title ?? r.slug,
      type: r.type ?? 'exam',
    })))
  }, [db])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function addListing(slug: string) {
    const maxPriority = focusListingsList.reduce((m, r) => r.priority > m ? r.priority : m, 0)
    await db.insert(focusListings)
      .values({ listingSlug: slug, priority: maxPriority + 1, addedAt: Date.now() })
      .onConflictDoNothing()
    await load()
  }

  async function removeListing(slug: string) {
    await db.delete(focusListings).where(eq(focusListings.listingSlug, slug))
    const remaining = focusListingsList.filter(r => r.slug !== slug)
    const normalized = normalizePriorities(remaining)
    await db.transaction(tx => {
      for (const r of normalized) {
        tx.update(focusListings).set({ priority: r.priority }).where(eq(focusListings.listingSlug, r.slug)).run()
      }
    })
    await load()
  }

  async function moveListing(slug: string, direction: 'up' | 'down') {
    const updated = swapPriority(focusListingsList, slug, direction)
    await db.transaction(tx => {
      for (const r of updated) {
        tx.update(focusListings).set({ priority: r.priority }).where(eq(focusListings.listingSlug, r.slug)).run()
      }
    })
    setFocusListingsList(updated)
  }

  function isInFocus(slug: string): boolean {
    return focusListingsList.some(r => r.slug === slug)
  }

  function getPriority(slug: string): number | null {
    return focusListingsList.find(r => r.slug === slug)?.priority ?? null
  }

  return { focusListings: focusListingsList, addListing, removeListing, moveListing, isInFocus, getPriority }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```
cd apps/mobile && npx jest hooks/__tests__/useFocusListings.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/useFocusListings.ts apps/mobile/hooks/__tests__/useFocusListings.test.ts
git commit -m "feat(hooks): add useFocusListings with normalizePriorities and swapPriority"
```

---

## Task 5: useRecordSession Hook (TDD)

**Files:**
- Create: `apps/mobile/hooks/__tests__/useRecordSession.test.ts`
- Create: `apps/mobile/hooks/useRecordSession.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/hooks/__tests__/useRecordSession.test.ts`:

```ts
import { buildSessionRecord } from '../useRecordSession'

describe('buildSessionRecord', () => {
  it('computes durationSecs from startTime', () => {
    const startTime = Date.now() - 62_000
    const record = buildSessionRecord({
      listingSlug: 'upcat-2025', topicId: 'topic-1', deckId: '',
      score: 8, total: 10, startTime,
    })
    expect(record.durationSecs).toBeGreaterThanOrEqual(61)
    expect(record.durationSecs).toBeLessThanOrEqual(65)
    expect(record.score).toBe(8)
    expect(record.total).toBe(10)
    expect(record.completedAt).toBeGreaterThan(startTime)
  })

  it('preserves empty string fields', () => {
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 5, startTime: Date.now(),
    })
    expect(record.listingSlug).toBe('')
    expect(record.topicId).toBe('')
    expect(record.deckId).toBe('')
  })

  it('rounds durationSecs to whole seconds', () => {
    const startTime = Date.now() - 30_500
    const record = buildSessionRecord({
      listingSlug: '', topicId: '', deckId: '', score: 0, total: 1, startTime,
    })
    expect(Number.isInteger(record.durationSecs)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/mobile && npx jest hooks/__tests__/useRecordSession.test.ts
```

Expected: `Cannot find module '../useRecordSession'`

- [ ] **Step 3: Create useRecordSession.ts**

Create `apps/mobile/hooks/useRecordSession.ts`:

```ts
import { useDb } from './useDb'
import { practiceSessions } from '../db/schema'

export interface SessionParams {
  listingSlug: string
  topicId: string
  deckId: string
  score: number
  total: number
  startTime: number
}

export interface SessionRecord {
  listingSlug: string
  topicId: string
  deckId: string
  score: number
  total: number
  durationSecs: number
  completedAt: number
}

export function buildSessionRecord(params: SessionParams): SessionRecord {
  const completedAt = Date.now()
  return {
    listingSlug: params.listingSlug,
    topicId: params.topicId,
    deckId: params.deckId,
    score: params.score,
    total: params.total,
    durationSecs: Math.round((completedAt - params.startTime) / 1000),
    completedAt,
  }
}

export function useRecordSession() {
  const db = useDb()

  async function recordSession(params: SessionParams): Promise<void> {
    const record = buildSessionRecord(params)
    await db.insert(practiceSessions).values(record)
  }

  return { recordSession }
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd apps/mobile && npx jest hooks/__tests__/useRecordSession.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/useRecordSession.ts apps/mobile/hooks/__tests__/useRecordSession.test.ts
git commit -m "feat(hooks): add useRecordSession with buildSessionRecord pure function"
```

---

## Task 6: useAnalytics Hook (TDD)

**Files:**
- Create: `apps/mobile/hooks/__tests__/useAnalytics.test.ts`
- Create: `apps/mobile/hooks/useAnalytics.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile/hooks/__tests__/useAnalytics.test.ts`:

```ts
import { computeStreak, computeWeeklyData } from '../useAnalytics'

describe('computeStreak', () => {
  it('returns 0 for no sessions', () => {
    expect(computeStreak([])).toBe(0)
  })

  it('returns 1 for a session today only', () => {
    expect(computeStreak([{ completedAt: Date.now() }])).toBe(1)
  })

  it('counts 3 consecutive days', () => {
    const day = 86_400_000
    const now = Date.now()
    const sessions = [
      { completedAt: now },
      { completedAt: now - day },
      { completedAt: now - 2 * day },
    ]
    expect(computeStreak(sessions)).toBe(3)
  })

  it('breaks at a gap', () => {
    const day = 86_400_000
    const now = Date.now()
    const sessions = [
      { completedAt: now },
      { completedAt: now - 3 * day },
    ]
    expect(computeStreak(sessions)).toBe(1)
  })

  it('returns 0 when only yesterday has a session', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(12, 0, 0, 0)
    expect(computeStreak([{ completedAt: yesterday.getTime() }])).toBe(0)
  })
})

describe('computeWeeklyData', () => {
  it('always returns exactly 7 entries', () => {
    expect(computeWeeklyData([])).toHaveLength(7)
  })

  it('returns null accuracy when no sessions on any day', () => {
    const bars = computeWeeklyData([])
    expect(bars.every(b => b.accuracy === null)).toBe(true)
  })

  it('computes accuracy for today correctly', () => {
    const sessions = [{ completedAt: Date.now(), score: 8, total: 10 }]
    const bars = computeWeeklyData(sessions)
    const today = bars[bars.length - 1]!
    expect(today.accuracy).toBe(80)
    expect(today.sessionCount).toBe(1)
  })

  it('ignores sessions with total=0 to avoid division errors', () => {
    const sessions = [{ completedAt: Date.now(), score: 0, total: 0 }]
    const bars = computeWeeklyData(sessions)
    expect(bars[bars.length - 1]!.accuracy).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```
cd apps/mobile && npx jest hooks/__tests__/useAnalytics.test.ts
```

Expected: `Cannot find module '../useAnalytics'`

- [ ] **Step 3: Create useAnalytics.ts**

Create `apps/mobile/hooks/useAnalytics.ts`:

```ts
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { useDb } from './useDb'
import { practiceSessions, topics, savedDecks } from '../db/schema'

export interface WeeklyBar {
  dayLabel: string
  accuracy: number | null
  sessionCount: number
}

export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
}

export interface RecentSession {
  id: number
  title: string
  accuracy: number
  completedAt: number
}

export interface AnalyticsData {
  sessionCount: number
  avgAccuracy: number | null
  streak: number
  weeklyData: WeeklyBar[]
  topicMastery: TopicMastery[]
  recentSessions: RecentSession[]
  isLoading: boolean
}

export function computeStreak(sessions: { completedAt: number }[]): number {
  if (sessions.length === 0) return 0
  const dayMs = 86_400_000
  const days = new Set(sessions.map(s => Math.floor(s.completedAt / dayMs)))
  const todayDay = Math.floor(Date.now() / dayMs)
  let streak = 0
  let cursor = todayDay
  while (days.has(cursor)) { streak++; cursor-- }
  return streak
}

export function computeWeeklyData(
  sessions: { completedAt: number; score: number; total: number }[]
): WeeklyBar[] {
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayMs = 86_400_000
  const now = new Date()
  const bars: WeeklyBar[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const start = d.getTime()
    const daySessions = sessions.filter(s => s.completedAt >= start && s.completedAt < start + dayMs && s.total > 0)
    const acc = daySessions.length > 0
      ? Math.round(daySessions.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / daySessions.length)
      : null
    bars.push({ dayLabel: DAY_LABELS[d.getDay()]!, accuracy: acc, sessionCount: daySessions.length })
  }
  return bars
}

export function useAnalytics(slug: string | 'overall'): AnalyticsData {
  const db = useDb()
  const [data, setData] = useState<AnalyticsData>({
    sessionCount: 0, avgAccuracy: null, streak: 0,
    weeklyData: [], topicMastery: [], recentSessions: [], isLoading: true,
  })

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
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

      if (!cancelled) setData({ sessionCount, avgAccuracy, streak, weeklyData, topicMastery, recentSessions, isLoading: false })
    }
    void load()
    return () => { cancelled = true }
  }, [db, slug]))

  return data
}
```

- [ ] **Step 4: Run — expect PASS**

```
cd apps/mobile && npx jest hooks/__tests__/useAnalytics.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/useAnalytics.ts apps/mobile/hooks/__tests__/useAnalytics.test.ts
git commit -m "feat(hooks): add useAnalytics with computeStreak and computeWeeklyData"
```

---

## Task 7: Navigation — 5th Analytics Tab

**Files:**
- Modify: `apps/mobile/components/TabBar.tsx`
- Modify: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Update TabBar.tsx**

In `apps/mobile/components/TabBar.tsx`:

1. Add `BarChart4Outlined` to the import:

```ts
import {
  Home2Outlined,
  Bolt2Outlined,
  GraduationCap1Outlined,
  BarChart4Outlined,
  User4Outlined,
} from '@lineiconshq/free-icons'
```

2. Add `analytics` entry to `TAB_META`:

```ts
const TAB_META: Record<string, { label: string; icon: typeof Home2Outlined }> = {
  index:     { label: 'Home',      icon: Home2Outlined },
  practice:  { label: 'Practice',  icon: Bolt2Outlined },
  listings:  { label: 'Listings',  icon: GraduationCap1Outlined },
  analytics: { label: 'Analytics', icon: BarChart4Outlined },
  profile:   { label: 'Profile',   icon: User4Outlined },
}
```

3. Increase `blur.width` from `284` to `340`:

```ts
  blur: {
    width: 340,
    ...
```

- [ ] **Step 2: Update _layout.tsx**

In `apps/mobile/app/(tabs)/_layout.tsx`, add the analytics screen between listings and profile:

```ts
      <Tabs.Screen name="index"     options={{ title: 'Home' }} />
      <Tabs.Screen name="practice"  options={{ title: 'Practice' }} />
      <Tabs.Screen name="listings"  options={{ title: 'Listings' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="profile"   options={{ title: 'Profile' }} />
```

- [ ] **Step 3: Create analytics.tsx placeholder**

Create `apps/mobile/app/(tabs)/analytics.tsx`:

```tsx
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function AnalyticsScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: 18 }}>Analytics</Text>
      <Text style={{ color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', fontSize: 12, marginTop: 6 }}>
        Coming soon
      </Text>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: Type-check and visual verify**

```
cd apps/mobile && npx tsc --noEmit
```

Then start the app (`npx expo start --clear`) and verify: 5 tabs appear in the tab bar, Analytics tab navigates to the placeholder screen.

- [ ] **Step 5: Commit**

```
git add apps/mobile/components/TabBar.tsx apps/mobile/app/(tabs)/_layout.tsx apps/mobile/app/(tabs)/analytics.tsx
git commit -m "feat(nav): add Analytics as 5th tab with BarChart4Outlined icon"
```

---

## Task 8: Onboarding — Multi-Select Step 2

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`

- [ ] **Step 1: Update state and imports**

In `apps/mobile/app/onboarding.tsx`, add `focusListings as focusListingsTable` to the DB schema import:

```ts
import { userSettings, flashcards, userProgress, focusListings as focusListingsTable } from '../db/schema'
```

Replace the step 2 state block:

```ts
  // Step 2 — was: selecting, selectedSlug; now: selectedSlugs[], saving
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loadingListings, setLoadingListings] = useState(false)
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedSlug, setSelectedSlug] = useState('')  // kept for assessment
```

- [ ] **Step 2: Replace handleSelectListing with handleConfirmListings**

Remove the old `handleSelectListing` function entirely. Add:

```ts
  async function handleConfirmListings() {
    if (selectedSlugs.length === 0) return
    setSaving(true)
    try {
      const now = Date.now()
      await db.transaction(tx => {
        tx.insert(userSettings).values({
          id: 1,
          selectedListingSlug: selectedSlugs[0]!,
          lastSyncedAt: 0,
          fullName: fullName.trim(),
          school: school.trim(),
          gradeLevel: gradeLevel ?? undefined,
        }).onConflictDoUpdate({
          target: userSettings.id,
          set: {
            selectedListingSlug: selectedSlugs[0]!,
            lastSyncedAt: 0,
            fullName: fullName.trim(),
            school: school.trim(),
            gradeLevel: gradeLevel ?? undefined,
          },
        }).run()

        for (let i = 0; i < selectedSlugs.length; i++) {
          tx.insert(focusListingsTable)
            .values({ listingSlug: selectedSlugs[i]!, priority: i + 1, addedAt: now })
            .onConflictDoNothing()
            .run()
        }
      })
      setSelectedSlug(selectedSlugs[0]!)
      await syncOnLaunch(db)
      setStep(3)
    } catch (e) {
      console.error('[onboarding] confirm error:', e)
    } finally {
      setSaving(false)
    }
  }
```

- [ ] **Step 3: Replace the step 2 render block**

Replace the entire `if (step === 2) { return (...) }` block with:

```tsx
  if (step === 2) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingTop: 24 }}>
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
          <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: '#831626' }} />
          <View style={{ width: 8, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.20)' }} />
        </View>

        <View style={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 }}>
          <TouchableOpacity onPress={() => setStep(1)} style={{ marginBottom: 12 }}>
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 12, color: 'rgba(255,255,255,0.40)' }}>← Back</Text>
          </TouchableOpacity>
          <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 26, color: '#fff', marginBottom: 4 }}>
            What are you{'\n'}preparing for?
          </Text>
          <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 13, color: 'rgba(255,255,255,0.50)' }}>
            Tap to select. First tap = #1 priority.
          </Text>
        </View>

        {loadingListings ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 160 }}
            renderItem={({ item }) => {
              const priorityIdx = selectedSlugs.indexOf(item.slug)
              const isSelected = priorityIdx !== -1
              return (
                <TouchableOpacity
                  onPress={() => setSelectedSlugs(prev =>
                    isSelected ? prev.filter(s => s !== item.slug) : [...prev, item.slug]
                  )}
                  style={{
                    backgroundColor: isSelected ? 'rgba(128,0,0,0.20)' : 'rgba(255,255,255,0.08)',
                    borderRadius: 18, padding: 16, marginBottom: 10,
                    borderWidth: isSelected ? 2 : 1,
                    borderColor: isSelected ? '#831626' : 'rgba(255,255,255,0.14)',
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}
                >
                  {isSelected && (
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#831626', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 12, color: '#fff' }}>#{priorityIdx + 1}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 14, color: '#fff' }}>{item.title}</Text>
                    {item.exam_date ? (
                      <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                        {new Date(item.exam_date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ color: isSelected ? '#fca5a5' : 'rgba(255,255,255,0.30)', fontSize: 18 }}>
                    {isSelected ? '✓' : '›'}
                  </Text>
                </TouchableOpacity>
              )
            }}
          />
        )}

        {/* Sticky bottom CTA */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 24, backgroundColor: '#1a1a2e', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.10)' }}>
          {selectedSlugs.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {selectedSlugs.map((slug, i) => {
                const listing = listings.find(l => l.slug === slug)
                return (
                  <View key={slug} style={{ backgroundColor: 'rgba(128,0,0,0.20)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.40)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: 10, color: '#fca5a5' }}>
                      #{i + 1} {listing?.title ?? slug}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}
          <TouchableOpacity
            disabled={selectedSlugs.length === 0 || saving}
            onPress={handleConfirmListings}
            style={{
              backgroundColor: selectedSlugs.length > 0 ? 'rgba(128,0,0,0.82)' : 'rgba(255,255,255,0.08)',
              borderRadius: 16, paddingVertical: 15, alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 14, color: selectedSlugs.length > 0 ? '#fff' : 'rgba(255,255,255,0.28)' }}>
              {saving ? 'Setting up…' : `Continue${selectedSlugs.length > 0 ? ` (${selectedSlugs.length})` : ''} →`}
            </Text>
          </TouchableOpacity>
        </View>

        {saving && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={{ color: 'rgba(255,255,255,0.70)', fontFamily: 'Lexend_400Regular', marginTop: 12, fontSize: 12 }}>Syncing your content…</Text>
          </View>
        )}
      </SafeAreaView>
    )
  }
```

- [ ] **Step 4: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(onboarding): multi-select listings with tap-order priority in step 2"
```

---

## Task 9: Onboarding — assessDone Focus Summary

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`

- [ ] **Step 1: Replace assessDone render block**

Find the `if (assessDone)` block in `onboarding.tsx` (around line 352) and replace with:

```tsx
  if (assessDone) {
    const correct = assessResults.filter(r => r.correct).length
    const pct = Math.round((correct / assessResults.length) * 100)
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#1a1a2e' }}>
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: 40 }}>
          <Text style={assessStyle.resultPct}>{pct}%</Text>
          <Text style={assessStyle.resultTitle}>You're all set!</Text>
          <Text style={assessStyle.resultSub}>
            Pre-assessment complete. {correct} of {assessResults.length} correct.{'\n'}We've calibrated your starting level.
          </Text>

          {selectedSlugs.length > 0 && (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontFamily: 'Lexend_600SemiBold', fontSize: 10, color: 'rgba(255,255,255,0.38)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                Your Focus List
              </Text>
              {selectedSlugs.map((slug, i) => {
                const listing = listings.find(l => l.slug === slug)
                return (
                  <View key={slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 12, color: '#fff' }}>#{i + 1}</Text>
                    </View>
                    <Text style={{ fontFamily: 'Outfit_600SemiBold', fontSize: 13, color: '#fff', flex: 1 }}>
                      {listing?.title ?? slug}
                    </Text>
                  </View>
                )
              })}
            </View>
          )}

          <View style={assessStyle.resultCounts}>
            <View style={assessStyle.resultCount}>
              <Text style={[assessStyle.resultNum, { color: '#4ade80' }]}>{correct}</Text>
              <Text style={assessStyle.resultLbl}>Correct</Text>
            </View>
            <View style={assessStyle.resultCount}>
              <Text style={[assessStyle.resultNum, { color: '#f87171' }]}>{assessResults.length - correct}</Text>
              <Text style={assessStyle.resultLbl}>Incorrect</Text>
            </View>
          </View>

          <TouchableOpacity style={[assessStyle.primaryBtn, { marginTop: 8 }]} onPress={finishOnboarding}>
            <Text style={assessStyle.primaryBtnTxt}>Start Learning →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }
```

- [ ] **Step 2: Type-check + smoke test**

```
cd apps/mobile && npx tsc --noEmit
```

Manually run the app and complete onboarding to verify the summary screen shows focus list.

- [ ] **Step 3: Commit**

```
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(onboarding): show focus list summary on assessment completion screen"
```

---

## Task 10: Practice Tab — Focus Cards + Quick Start

**Files:**
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Add imports**

At the top of `apps/mobile/app/(tabs)/practice.tsx`, add:

```ts
import { useMemo } from 'react'   // add to existing react import
import { useFocusListings, type FocusListing } from '../../hooks/useFocusListings'
```

- [ ] **Step 2: Add hook and active state in PracticeScreen**

Inside `PracticeScreen`, add:

```ts
  const { focusListings: focusListingsList } = useFocusListings()
  const [activeFocusSlug, setActiveFocusSlug] = useState<string>('')

  // Sync activeFocusSlug to first focus listing when list loads
  useEffect(() => {
    if (focusListingsList.length > 0 && !activeFocusSlug) {
      setActiveFocusSlug(focusListingsList[0]!.slug)
    }
  }, [focusListingsList])
```

Add `useEffect` to the react import line.

- [ ] **Step 3: Compute active topic sets**

After the hook calls, add:

```ts
  const activeTopicIds = useMemo(
    () => new Set(topicIdsByListingSlug[activeFocusSlug] ?? []),
    [topicIdsByListingSlug, activeFocusSlug]
  )

  const activeRecommended = useMemo(
    () => topicRows
      .filter(r => activeTopicIds.has(r.topic.id))
      .sort((a, b) =>
        ({ New: 0, Weak: 1, Review: 2, Strong: 3 }[a.strength] ?? 0) -
        ({ New: 0, Weak: 1, Review: 2, Strong: 3 }[b.strength] ?? 0)
      )
      .slice(0, 5),
    [topicRows, activeTopicIds]
  )

  const weakTopicsForActive = useMemo(
    () => topicRows.filter(r => activeTopicIds.has(r.topic.id) && r.strength === 'Weak'),
    [topicRows, activeTopicIds]
  )

  const activeListing = useMemo(
    () => focusListingsList.find(r => r.slug === activeFocusSlug),
    [focusListingsList, activeFocusSlug]
  )
```

Also pull `topicIdsByListingSlug` from `usePracticeData()`:

```ts
  const { subjects, topicRows, recommendedTopics, selectedSubjectId, setSelectedSubjectId, totalCards, cardCountByTopic, topicIdsByListingSlug } = usePracticeData()
```

- [ ] **Step 4: Add FocusCard component**

Add before `PracticeScreen`:

```tsx
function FocusCard({ row, isActive, onPress }: { row: FocusListing; isActive: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[fc.card, isActive && fc.cardActive]}
      activeOpacity={0.8}
    >
      <Text style={fc.badge}>#{row.priority} · {row.type === 'exam' ? 'Exam' : 'Scholar'}</Text>
      <Text style={fc.name} numberOfLines={2}>{row.title}</Text>
    </TouchableOpacity>
  )
}

const fc = StyleSheet.create({
  card: { minWidth: 110, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 16, padding: 11, marginRight: 8 },
  cardActive: { backgroundColor: 'rgba(128,0,0,0.18)', borderColor: '#831626', borderWidth: 2 },
  badge: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.40)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: 'Lexend_600SemiBold' },
  name: { fontSize: 11, fontWeight: '700', color: '#fff', lineHeight: 15, fontFamily: 'Outfit_700Bold' },
})
```

- [ ] **Step 5: Add focus cards + quick start to ListHeaderComponent**

In the `ListHeaderComponent` of the FlatList, prepend before the Recommended section:

```tsx
            {/* Focus cards row */}
            {focusListingsList.length > 0 && (
              <>
                <View style={s.secRow}>
                  <Text style={s.secTitle}>My Focus</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingRight: 4, marginBottom: 12 }}
                >
                  {focusListingsList.map(row => (
                    <FocusCard
                      key={row.slug}
                      row={row}
                      isActive={row.slug === activeFocusSlug}
                      onPress={() => setActiveFocusSlug(row.slug)}
                    />
                  ))}
                </ScrollView>
              </>
            )}

            {/* Quick Start — auto-generated decks for active focus */}
            {activeFocusSlug ? (
              <>
                <View style={s.secRow}>
                  <Text style={s.secTitle}>Quick Start</Text>
                  <Text style={s.secSub}>{activeListing?.title ?? ''}</Text>
                </View>
                <TouchableOpacity
                  style={qs.card}
                  onPress={() => router.push(`/practice/listing/${activeFocusSlug}?mode=all`)}
                  activeOpacity={0.8}
                >
                  <View style={qs.icon}><Text style={{ fontSize: 15 }}>⚡</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={qs.title}>Full Review Deck</Text>
                    <Text style={qs.sub}>Auto · all topics tagged to this listing</Text>
                  </View>
                  <Text style={qs.go}>›</Text>
                </TouchableOpacity>
                {weakTopicsForActive.length > 0 && (
                  <TouchableOpacity
                    style={qs.card2}
                    onPress={() => router.push(`/practice/listing/${activeFocusSlug}?mode=weak`)}
                    activeOpacity={0.8}
                  >
                    <View style={qs.icon2}><Text style={{ fontSize: 15 }}>⚠️</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={qs.title}>Weak Topics Only</Text>
                      <Text style={qs.sub}>Smart · {weakTopicsForActive.length} weak topics</Text>
                    </View>
                    <Text style={[qs.go, { color: 'rgba(245,158,11,0.80)' }]}>›</Text>
                  </TouchableOpacity>
                )}
                <View style={{ height: 4 }} />
              </>
            ) : null}

            {/* Recommended section — now uses activeRecommended */}
            {activeRecommended.length > 0 && (
```

Also update the existing `recommendedTopics` reference in the FlatList header to use `activeRecommended`:

Replace `{recommendedTopics.map(row => (` with `{activeRecommended.map(row => (`.

Replace `{listing?.title ?? ''}` in the secSub to `{activeListing?.title ?? ''}`.

- [ ] **Step 6: Add qs stylesheet**

```ts
const qs = StyleSheet.create({
  card:  { backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.28)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  card2: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.20)', borderRadius: 16, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 7 },
  icon:  { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(128,0,0,0.22)', borderWidth: 1, borderColor: 'rgba(128,0,0,0.35)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon2: { width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  sub:   { fontSize: 9, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginTop: 1 },
  go:    { fontSize: 18, color: 'rgba(128,0,0,0.80)', marginLeft: 'auto', flexShrink: 0 },
})
```

- [ ] **Step 7: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```
git add apps/mobile/app/(tabs)/practice.tsx
git commit -m "feat(practice): focus cards row and Quick Start deck shortcuts"
```

---

## Task 11: Virtual Deck Quiz Route

**Files:**
- Create: `apps/mobile/app/practice/listing/[slug].tsx`

- [ ] **Step 1: Create the directory**

```
mkdir -p apps/mobile/app/practice/listing
```

- [ ] **Step 2: Create [slug].tsx**

This is the quiz engine for listing-scoped virtual decks. Create `apps/mobile/app/practice/listing/[slug].tsx`:

```tsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { flashcards as flashcardsTable, userProgress, listings as listingsTable } from '../../../db/schema'
import { eq } from 'drizzle-orm'
import { useRecordSession } from '../../../hooks/useRecordSession'

const TIMER_SECS = 20
const MAX_QUESTIONS = 20
const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const
const DIFF_COLOR: Record<number, string> = { 1: '#4ade80', 2: '#fbbf24', 3: '#f87171' }
const DIFF_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }

interface QuizQuestion {
  id: string; stem: string; options: string[]; answerIndex: number; explanation: string; difficulty: number
}
interface UserAnswer {
  flashcardId: string; selectedIndex: number | null; correct: boolean
}

function parseQuizQuestion(card: { id: string; question: string; answer: string; explanation: string; difficulty: number }): QuizQuestion | null {
  const m = card.question.match(/\bA\)\s*(.*?)\s+B\)\s*(.*?)\s+C\)\s*(.*?)\s+D\)\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A\)\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])\)/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return { id: card.id, stem, options, answerIndex, explanation: card.explanation, difficulty: card.difficulty }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

type Phase = 'loading' | 'ready' | 'quiz' | 'results'

export default function ListingQuizScreen() {
  const { slug, mode } = useLocalSearchParams<{ slug: string; mode?: string }>()
  const db = useDb()
  const { recordSession } = useRecordSession()

  const [listingTitle, setListingTitle] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [phase, setPhase] = useState<Phase>('loading')
  const [currentIdx, setCurrentIdx] = useState(0)
  const [answers, setAnswers] = useState<UserAnswer[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState(TIMER_SECS)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeLeftRef = useRef(TIMER_SECS)
  const advanceRef = useRef<(sel: number | null) => void>(() => {})
  const startTimeRef = useRef(0)
  const timerProgress = useRef(new Animated.Value(1)).current
  const timerAnimRef = useRef<Animated.CompositeAnimation | null>(null)

  useEffect(() => {
    async function load() {
      const [listingRows, allCards, progress] = await Promise.all([
        db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.slug, slug)).limit(1),
        db.select({ id: flashcardsTable.id, topicId: flashcardsTable.topicId, question: flashcardsTable.question, answer: flashcardsTable.answer, explanation: flashcardsTable.explanation, difficulty: flashcardsTable.difficulty, listingSlugs: flashcardsTable.listingSlugs }).from(flashcardsTable),
        db.select({ flashcardId: userProgress.flashcardId, correct: userProgress.correct }).from(userProgress),
      ])

      setListingTitle(listingRows[0]?.title ?? slug)

      // Filter cards belonging to this listing
      const matching = allCards.filter(card => {
        try { return (JSON.parse(card.listingSlugs ?? '[]') as string[]).includes(slug) }
        catch { return false }
      })

      let filtered = matching
      if (mode === 'weak') {
        // Find topics with <60% accuracy
        const fcByTopic: Record<string, string[]> = {}
        for (const c of matching) {
          if (!fcByTopic[c.topicId]) fcByTopic[c.topicId] = []
          fcByTopic[c.topicId]!.push(c.id)
        }
        const weakTopicIds = new Set<string>()
        for (const [topicId, fcIds] of Object.entries(fcByTopic)) {
          const tp = progress.filter(p => fcIds.includes(p.flashcardId))
          if (tp.length === 0) continue
          const correct = tp.filter(p => p.correct === true || (p.correct as unknown as number) === 1).length
          if (correct / tp.length < 0.6) weakTopicIds.add(topicId)
        }
        filtered = matching.filter(c => weakTopicIds.has(c.topicId))
      }

      const parsed = shuffle(filtered).map(parseQuizQuestion).filter((q): q is QuizQuestion => q !== null).slice(0, MAX_QUESTIONS)
      setQuestions(parsed)
      setPhase(parsed.length === 0 ? 'results' : 'ready')
    }
    void load()
  }, [db, slug, mode])

  useEffect(() => () => { stopTimer() }, [])

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    timerAnimRef.current?.stop()
  }

  function startTimer() {
    stopTimer()
    timeLeftRef.current = TIMER_SECS
    setTimeLeft(TIMER_SECS)
    timerProgress.setValue(1)
    timerAnimRef.current = Animated.timing(timerProgress, { toValue: 0, duration: TIMER_SECS * 1000, useNativeDriver: false })
    timerAnimRef.current.start()
    timerRef.current = setInterval(() => {
      timeLeftRef.current -= 1
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) { stopTimer(); advanceRef.current(null) }
    }, 1000)
  }

  const advance = useCallback((sel: number | null) => {
    const q = questions[currentIdx]
    if (!q) return
    const correct = sel !== null && sel === q.answerIndex
    const newAnswers: UserAnswer[] = [...answers, { flashcardId: q.id, selectedIndex: sel, correct }]

    if (currentIdx === questions.length - 1) {
      stopTimer()
      const score = newAnswers.filter(a => a.correct).length
      const now = Date.now()
      db.transaction(tx => {
        for (const a of newAnswers) {
          tx.insert(userProgress).values({ flashcardId: a.flashcardId, correct: a.correct, answeredAt: now }).run()
        }
      })
      void recordSession({
        listingSlug: slug,
        topicId: '',
        deckId: mode === 'weak' ? '__weak__' : '__full__',
        score,
        total: newAnswers.length,
        startTime: startTimeRef.current,
      })
      setAnswers(newAnswers)
      setPhase('results')
    } else {
      setAnswers(newAnswers)
      setCurrentIdx(i => i + 1)
      setSelectedIdx(null)
      startTimer()
    }
  }, [questions, currentIdx, answers, db, slug, mode, recordSession])

  useEffect(() => { advanceRef.current = advance })

  function handleSelect(idx: number) {
    if (selectedIdx !== null) return
    stopTimer()
    setSelectedIdx(idx)
    setTimeout(() => advance(idx), 650)
  }

  function startQuiz() {
    startTimeRef.current = Date.now()
    setCurrentIdx(0); setAnswers([]); setSelectedIdx(null); setPhase('quiz')
    setTimeout(() => startTimer(), 50)
  }

  const modeLabel = mode === 'weak' ? 'Weak Topics' : 'Full Review'

  if (phase === 'loading') return (
    <SafeAreaView style={s.root}><Text style={s.loadingTxt}>Loading…</Text></SafeAreaView>
  )

  if (phase === 'ready') return (
    <SafeAreaView style={s.root}>
      <View style={s.readyWrap}>
        <View style={s.readyIcon}><Text style={{ fontSize: 36 }}>{mode === 'weak' ? '⚠️' : '⚡'}</Text></View>
        <Text style={s.readyTitle}>{modeLabel}</Text>
        <Text style={s.readySub}>{listingTitle}</Text>
        <Text style={s.readySub2}>{questions.length} questions · {TIMER_SECS}s each</Text>
        <TouchableOpacity style={s.startBtn} onPress={startQuiz}>
          <Text style={s.startBtnTxt}>Start Quiz →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}>
          <Text style={s.ghostBtnTxt}>← Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )

  if (phase === 'results') {
    const correct = answers.filter(a => a.correct).length
    const total = answers.length
    const pct = total > 0 ? Math.round((correct / total) * 100) : 0
    const passed = pct >= 60
    if (total === 0) return (
      <SafeAreaView style={s.root}>
        <View style={s.readyWrap}>
          <Text style={s.readyTitle}>{mode === 'weak' ? 'No weak topics yet!' : 'No cards found'}</Text>
          <Text style={s.readySub2}>{mode === 'weak' ? 'Keep practicing to identify weak topics.' : 'No flashcards are tagged to this listing yet.'}</Text>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}><Text style={s.ghostBtnTxt}>← Back</Text></TouchableOpacity>
        </View>
      </SafeAreaView>
    )
    return (
      <SafeAreaView style={s.root}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
          <Text style={s.topBarTitle}>Results</Text>
          <TouchableOpacity onPress={startQuiz}><Text style={s.retryLink}>Retry</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 48 }}>
          <View style={[s.scoreCard, passed ? s.scorePass : s.scoreFail]}>
            <Text style={[s.scorePct, { color: passed ? '#4ade80' : '#fca5a5' }]}>{pct}%</Text>
            <Text style={s.scoreVerdict}>{passed ? '🎉 Great job!' : '📚 Keep practicing'}</Text>
            <Text style={s.scoreSub}>{modeLabel} · {listingTitle}</Text>
            <View style={{ flexDirection: 'row', gap: 28, marginTop: 16 }}>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: '#4ade80' }]}>{correct}</Text><Text style={s.scoreLbl}>Correct</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: '#f87171' }]}>{total - correct}</Text><Text style={s.scoreLbl}>Wrong</Text></View>
              <View style={{ alignItems: 'center' }}><Text style={[s.scoreNum, { color: 'rgba(255,255,255,0.62)' }]}>{total}</Text><Text style={s.scoreLbl}>Total</Text></View>
            </View>
          </View>
          <TouchableOpacity style={s.startBtn} onPress={startQuiz}><Text style={s.startBtnTxt}>Play Again</Text></TouchableOpacity>
          <TouchableOpacity style={s.ghostBtn} onPress={() => router.back()}><Text style={s.ghostBtnTxt}>← Back</Text></TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  const q = questions[currentIdx]!
  const timerBarColor = timerProgress.interpolate({ inputRange: [0, 0.3, 1], outputRange: ['#f87171', '#fbbf24', '#4ade80'], extrapolate: 'clamp' })
  const timerBarWidth = timerProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })

  return (
    <SafeAreaView style={s.root}>
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => { stopTimer(); router.back() }}><Text style={s.backArrow}>‹</Text></TouchableOpacity>
        <Text style={s.topBarTitle} numberOfLines={1}>{modeLabel}</Text>
        <Text style={s.qCounter}>{currentIdx + 1} / {questions.length}</Text>
      </View>
      <View style={s.dotsRow}>{questions.map((_, i) => <View key={i} style={[s.dot, i < currentIdx && s.dotDone, i === currentIdx && s.dotCurrent]} />)}</View>
      <View style={s.timerBg}><Animated.View style={[s.timerFill, { width: timerBarWidth, backgroundColor: timerBarColor }]} /></View>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 14, marginTop: 4, marginBottom: 4 }}>
        <Text style={[{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', fontFamily: 'Lexend_600SemiBold' }, timeLeft <= 5 && { color: '#f87171' }]}>{timeLeft}s</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 40 }}>
        <View style={s.questionCard}>
          <Text style={s.questionMeta}>QUESTION {currentIdx + 1} OF {questions.length}</Text>
          <Text style={s.questionText}>{q.stem}</Text>
          <View style={[s.diffBadge, { borderColor: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>
            <Text style={[s.diffTxt, { color: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>{DIFF_LABEL[q.difficulty] ?? 'Medium'}</Text>
          </View>
        </View>
        <View style={{ gap: 9 }}>
          {q.options.map((opt, oi) => {
            const isSelected = selectedIdx === oi
            return (
              <TouchableOpacity key={oi} style={[s.optionBtn, isSelected && s.optionBtnSelected]} onPress={() => handleSelect(oi)} activeOpacity={0.72} disabled={selectedIdx !== null}>
                <View style={[s.optionLetterBox, isSelected && s.optionLetterBoxOn]}>
                  <Text style={[s.optionLetter, isSelected && { color: '#fff' }]}>{OPTION_LETTERS[oi]}</Text>
                </View>
                <Text style={[s.optionText, isSelected && { color: '#fff', fontFamily: 'Lexend_600SemiBold' }]} numberOfLines={4}>{opt}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  loadingTxt: { color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center', marginTop: 80, fontSize: 13 },
  readyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  readyIcon: { width: 72, height: 72, backgroundColor: 'rgba(128,0,0,0.18)', borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  readyTitle: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', textAlign: 'center', marginBottom: 4 },
  readySub: { fontSize: 12, color: 'rgba(255,255,255,0.60)', fontFamily: 'Lexend_400Regular', marginBottom: 2, textAlign: 'center' },
  readySub2: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginBottom: 28, textAlign: 'center' },
  startBtn: { backgroundColor: 'rgba(128,0,0,0.85)', borderRadius: 18, paddingVertical: 15, paddingHorizontal: 40, alignItems: 'center', width: '100%', marginBottom: 10 },
  startBtnTxt: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  ghostBtn: { paddingVertical: 12, width: '100%', alignItems: 'center' },
  ghostBtnTxt: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: 'Lexend_400Regular' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, gap: 8 },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backArrow: { color: 'rgba(255,255,255,0.62)', fontSize: 26, lineHeight: 30 },
  topBarTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  qCounter: { fontSize: 11, fontWeight: '700', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  retryLink: { fontSize: 11, fontWeight: '600', color: '#fca5a5', fontFamily: 'Lexend_600SemiBold' },
  dotsRow: { flexDirection: 'row', gap: 4, paddingHorizontal: 14, marginBottom: 8, flexWrap: 'wrap' },
  dot: { height: 4, flex: 1, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)' },
  dotDone: { backgroundColor: 'rgba(128,0,0,0.60)' },
  dotCurrent: { backgroundColor: '#fca5a5' },
  timerBg: { marginHorizontal: 14, height: 5, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 99, overflow: 'hidden' },
  timerFill: { height: 5, borderRadius: 99 },
  questionCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 22, padding: 18, marginBottom: 14 },
  questionMeta: { fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10, fontFamily: 'Lexend_600SemiBold' },
  questionText: { fontSize: 16, fontWeight: '600', color: '#fff', lineHeight: 24, fontFamily: 'Outfit_600SemiBold', marginBottom: 12 },
  diffBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  diffTxt: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  optionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 14 },
  optionBtnSelected: { backgroundColor: 'rgba(128,0,0,0.22)', borderColor: '#800000' },
  optionLetterBox: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLetterBoxOn: { backgroundColor: '#800000' },
  optionLetter: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.55)', fontFamily: 'Outfit_700Bold' },
  optionText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.75)', fontFamily: 'Lexend_400Regular', lineHeight: 19 },
  scoreCard: { borderRadius: 24, padding: 22, marginBottom: 20, borderWidth: 1, alignItems: 'center' },
  scorePass: { backgroundColor: 'rgba(34,197,94,0.08)', borderColor: 'rgba(34,197,94,0.25)' },
  scoreFail: { backgroundColor: 'rgba(239,68,68,0.07)', borderColor: 'rgba(239,68,68,0.20)' },
  scorePct: { fontSize: 60, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: -2, marginBottom: 4 },
  scoreVerdict: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 2 },
  scoreSub: { fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular' },
  scoreNum: { fontSize: 28, fontWeight: '700', fontFamily: 'Outfit_700Bold' },
  scoreLbl: { fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textTransform: 'uppercase', letterSpacing: 0.5 },
})
```

- [ ] **Step 3: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add apps/mobile/app/practice/listing/
git commit -m "feat(practice): add virtual deck quiz route for listing-scoped full/weak decks"
```

---

## Task 12: Session Recording in Existing Quiz Screens

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

- [ ] **Step 1: Update [topicId].tsx**

Add to imports:

```ts
import { useRecordSession } from '../../hooks/useRecordSession'
```

Add `listingSlug` URL param (after `topicId`):

```ts
  const { topicId, listingSlug } = useLocalSearchParams<{ topicId: string; listingSlug?: string }>()
```

Add hook call and ref inside `QuizScreen`:

```ts
  const { recordSession } = useRecordSession()
  const startTimeRef = useRef(0)
```

In the `startQuiz` function (where `setPhase('quiz')` is called), set the start time:

```ts
  function startQuiz(qs?: QuizQuestion[]) {
    startTimeRef.current = Date.now()   // ADD THIS LINE
    const qList = qs ?? questions
    ...
```

In `advance()`, at the `if (currentIdx === questions.length - 1)` branch, after `db.transaction(...)` and before `setPhase('results')`, add:

```ts
      void recordSession({
        listingSlug: listingSlug ?? '',
        topicId,
        deckId: '',
        score: newAnswers.filter(a => a.correct).length,
        total: newAnswers.length,
        startTime: startTimeRef.current,
      })
```

- [ ] **Step 2: Update deck/[deckId].tsx**

Add to imports:

```ts
import { useRecordSession } from '../../../hooks/useRecordSession'
```

Add `listingSlug` URL param:

```ts
  const { deckId, listingSlug } = useLocalSearchParams<{ deckId: string; listingSlug?: string }>()
```

Add inside `DeckQuizScreen`:

```ts
  const { recordSession } = useRecordSession()
  const startTimeRef = useRef(0)
```

In `startQuiz`, add `startTimeRef.current = Date.now()` before `setPhase('quiz')`.

In `advance()`, at the last-question branch, after `db.transaction(...)`:

```ts
      void recordSession({
        listingSlug: listingSlug ?? '',
        topicId: '',
        deckId,
        score: newAnswers.filter(a => a.correct).length,
        total: newAnswers.length,
        startTime: startTimeRef.current,
      })
```

- [ ] **Step 3: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add apps/mobile/app/practice/[topicId].tsx apps/mobile/app/practice/deck/[deckId].tsx
git commit -m "feat(quiz): record session to practice_sessions on quiz completion"
```

---

## Task 13: Listings Tab — Focus Badges

**Files:**
- Modify: `apps/mobile/app/(tabs)/listings.tsx`

- [ ] **Step 1: Import useFocusListings**

Add to imports in `apps/mobile/app/(tabs)/listings.tsx`:

```ts
import { useFocusListings } from '../../hooks/useFocusListings'
```

- [ ] **Step 2: Call hook in ListingsScreen**

Inside `ListingsScreen`, add:

```ts
  const { isInFocus, getPriority } = useFocusListings()
```

- [ ] **Step 3: Add focus badge to card render**

In the `renderItem` of the FlatList, after the `typeBadge` View, add:

```tsx
                {(() => {
                  const p = getPriority(l.slug)
                  return p !== null ? (
                    <View style={s.focusBadge}>
                      <Text style={s.focusBadgeTxt}>#{p} Focus</Text>
                    </View>
                  ) : null
                })()}
```

- [ ] **Step 4: Add focusBadge styles**

In the `StyleSheet.create` at the bottom, add:

```ts
  focusBadge: { backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, flexShrink: 0 },
  focusBadgeTxt: { fontSize: 8, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold' },
```

- [ ] **Step 5: Type-check + commit**

```
cd apps/mobile && npx tsc --noEmit
git add apps/mobile/app/(tabs)/listings.tsx
git commit -m "feat(listings): show focus priority badge on listing cards"
```

---

## Task 14: Listing Detail — Add/Remove Focus CTA

**Files:**
- Modify: `apps/mobile/app/listings/[slug].tsx`

- [ ] **Step 1: Import useFocusListings**

```ts
import { useFocusListings } from '../../hooks/useFocusListings'
```

- [ ] **Step 2: Call hook in ListingDetailScreen**

Inside `ListingDetailScreen`, add:

```ts
  const { isInFocus, getPriority, addListing, removeListing } = useFocusListings()
  const inFocus = isInFocus(slug)
  const focusPriority = getPriority(slug)
```

- [ ] **Step 3: Add CTA block to the JSX**

Find where the "Start Practicing" / external URL buttons are rendered in the scroll view and insert before them:

```tsx
              {/* Focus CTA */}
              <View style={{ marginBottom: 12 }}>
                {inFocus ? (
                  <TouchableOpacity
                    style={{ backgroundColor: 'rgba(128,0,0,0.12)', borderWidth: 2, borderColor: '#831626', borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
                    onPress={() => removeListing(slug)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 13, color: '#fca5a5' }}>
                      ✓ In Focus #{focusPriority} — Tap to Remove
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={{ backgroundColor: 'rgba(128,0,0,0.82)', borderRadius: 18, paddingVertical: 14, alignItems: 'center' }}
                    onPress={() => addListing(slug)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontFamily: 'Outfit_700Bold', fontSize: 13, color: '#fff' }}>
                      + Add to Focus
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
```

- [ ] **Step 4: Type-check + commit**

```
cd apps/mobile && npx tsc --noEmit
git add apps/mobile/app/listings/[slug].tsx
git commit -m "feat(listing-detail): add/remove focus CTA above Start Practicing button"
```

---

## Task 15: Profile — My Focus List Section

**Files:**
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Import useFocusListings and router**

Add to imports in `apps/mobile/app/(tabs)/profile.tsx`:

```ts
import { router } from 'expo-router'
import { useFocusListings } from '../../hooks/useFocusListings'
```

- [ ] **Step 2: Call hook in ProfileScreen**

Inside `ProfileScreen`, add:

```ts
  const { focusListings: focusListingsData, moveListing, removeListing } = useFocusListings()
```

- [ ] **Step 3: Replace "Change Exam" card with My Focus List**

Replace the `handleChangeExam` TouchableOpacity card with:

```tsx
        {/* My Focus List */}
        <View style={s.focusSection}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={s.secTitle}>My Focus List</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/listings')}>
              <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(128,0,0,0.80)' }}>+ Add More</Text>
            </TouchableOpacity>
          </View>
          {focusListingsData.length === 0 ? (
            <Text style={{ fontFamily: 'Lexend_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.38)', marginBottom: 4 }}>
              No exams in focus. Tap "+ Add More" to get started.
            </Text>
          ) : (
            focusListingsData.map(item => (
              <View key={item.slug} style={s.focusItem}>
                <View style={s.focusPriorityBadge}>
                  <Text style={s.focusPriorityTxt}>#{item.priority}</Text>
                </View>
                <Text style={s.focusItemTitle} numberOfLines={1}>{item.title}</Text>
                <TouchableOpacity
                  onPress={() => moveListing(item.slug, 'up')}
                  disabled={item.priority === 1}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 16, color: item.priority === 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)' }}>↑</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveListing(item.slug, 'down')}
                  disabled={item.priority === focusListingsData.length}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={{ fontSize: 16, color: item.priority === focusListingsData.length ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.45)' }}>↓</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeListing(item.slug)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                  <Text style={{ fontSize: 14, color: 'rgba(255,255,255,0.30)' }}>✕</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
```

- [ ] **Step 4: Add new styles**

```ts
  focusSection:       { backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 22, padding: 16, marginBottom: 10 },
  secTitle:           { fontSize: 13, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  focusItem:          { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  focusPriorityBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(128,0,0,0.82)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  focusPriorityTxt:   { fontSize: 11, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  focusItemTitle:     { flex: 1, fontSize: 12, color: '#fff', fontFamily: 'Outfit_600SemiBold' },
```

- [ ] **Step 5: Type-check + commit**

```
cd apps/mobile && npx tsc --noEmit
git add apps/mobile/app/(tabs)/profile.tsx
git commit -m "feat(profile): replace Change Exam with My Focus List reorder section"
```

---

## Task 16: Analytics Screen — Full Implementation

**Files:**
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Replace placeholder with full screen**

Replace the contents of `apps/mobile/app/(tabs)/analytics.tsx` entirely:

```tsx
import { useState, useMemo } from 'react'
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAnalytics } from '../../hooks/useAnalytics'
import { useFocusListings } from '../../hooks/useFocusListings'

function StatCard({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <View style={s.statCard}>
      <Text style={[s.statVal, color ? { color } : {}]}>{value}</Text>
      <Text style={s.statLbl}>{label}</Text>
    </View>
  )
}

function WeeklyChart({ data }: { data: { dayLabel: string; accuracy: number | null; sessionCount: number }[] }) {
  const maxAcc = Math.max(...data.map(d => d.accuracy ?? 0), 1)
  return (
    <View style={s.chartWrap}>
      {data.map((bar, i) => {
        const height = bar.accuracy !== null ? Math.round((bar.accuracy / 100) * 60) : 0
        const isToday = i === data.length - 1
        return (
          <View key={i} style={s.barCol}>
            <View style={s.barBg}>
              {bar.accuracy !== null && (
                <View style={[s.barFill, { height, backgroundColor: isToday ? '#fca5a5' : 'rgba(128,0,0,0.55)' }]} />
              )}
            </View>
            <Text style={[s.barLabel, isToday && s.barLabelToday]}>{bar.dayLabel}</Text>
            {bar.accuracy !== null && (
              <Text style={s.barPct}>{bar.accuracy}%</Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

export default function AnalyticsScreen() {
  const { focusListings } = useFocusListings()
  const [activeSlug, setActiveSlug] = useState<string | 'overall'>('overall')
  const analytics = useAnalytics(activeSlug)

  function fmtDate(ts: number): string {
    return new Date(ts).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>Analytics</Text>
        <Text style={s.subtitle}>Your practice progress</Text>
      </View>

      {/* Listing filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.tabsContent}
        style={s.tabsScroll}
      >
        <TouchableOpacity
          style={[s.tab, activeSlug === 'overall' && s.tabActive]}
          onPress={() => setActiveSlug('overall')}
        >
          <Text style={[s.tabTxt, activeSlug === 'overall' && s.tabTxtActive]}>Overall</Text>
        </TouchableOpacity>
        {focusListings.map(fl => (
          <TouchableOpacity
            key={fl.slug}
            style={[s.tab, activeSlug === fl.slug && s.tabActive]}
            onPress={() => setActiveSlug(fl.slug)}
          >
            <Text style={[s.tabTxt, activeSlug === fl.slug && s.tabTxtActive]} numberOfLines={1}>{fl.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Stats grid */}
        <View style={s.statsGrid}>
          <StatCard
            value={analytics.sessionCount > 0 ? String(analytics.sessionCount) : '—'}
            label="SESSIONS"
            color="#fca5a5"
          />
          <StatCard
            value={analytics.avgAccuracy !== null ? `${analytics.avgAccuracy}%` : '—'}
            label="AVG ACCURACY"
          />
          <StatCard
            value={analytics.streak > 0 ? `${analytics.streak}🔥` : '—'}
            label="STREAK"
            color="#fbbf24"
          />
          <StatCard
            value={analytics.weeklyData.filter(d => d.sessionCount > 0).length > 0
              ? String(analytics.weeklyData.filter(d => d.sessionCount > 0).length)
              : '—'
            }
            label="ACTIVE DAYS"
            color="#4ade80"
          />
        </View>

        {/* Weekly chart */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>This Week</Text>
          <WeeklyChart data={analytics.weeklyData} />
        </View>

        {/* Topic mastery */}
        {analytics.topicMastery.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Topic Mastery</Text>
            {analytics.topicMastery.map((tm, i) => (
              <View key={i} style={s.masteryRow}>
                <Text style={s.masteryLabel} numberOfLines={1}>{tm.label}</Text>
                <View style={s.masteryBarBg}>
                  <View style={[s.masteryBarFill, { width: `${tm.accuracy}%` as any, backgroundColor: tm.accuracy >= 80 ? '#4ade80' : tm.accuracy >= 50 ? '#fbbf24' : '#f87171' }]} />
                </View>
                <Text style={s.masteryPct}>{tm.accuracy}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* Recent sessions */}
        {analytics.recentSessions.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Recent Sessions</Text>
            {analytics.recentSessions.map(rs => (
              <View key={rs.id} style={s.recentRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.recentTitle} numberOfLines={1}>{rs.title}</Text>
                  <Text style={s.recentDate}>{fmtDate(rs.completedAt)}</Text>
                </View>
                <View style={[s.recentBadge, { backgroundColor: rs.accuracy >= 80 ? 'rgba(34,197,94,0.12)' : rs.accuracy >= 60 ? 'rgba(245,158,11,0.10)' : 'rgba(239,68,68,0.10)', borderColor: rs.accuracy >= 80 ? 'rgba(34,197,94,0.25)' : rs.accuracy >= 60 ? 'rgba(245,158,11,0.22)' : 'rgba(239,68,68,0.22)' }]}>
                  <Text style={[s.recentBadgeTxt, { color: rs.accuracy >= 80 ? '#4ade80' : rs.accuracy >= 60 ? '#fbbf24' : '#f87171' }]}>{rs.accuracy}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {analytics.sessionCount === 0 && !analytics.isLoading && (
          <View style={s.emptyState}>
            <Text style={s.emptyTitle}>No sessions yet</Text>
            <Text style={s.emptySub}>Complete a quiz to see your analytics here.</Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a1a2e' },
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: -0.3, fontFamily: 'Outfit_700Bold' },
  subtitle: { fontSize: 10, color: 'rgba(255,255,255,0.38)', marginTop: 2, fontFamily: 'Lexend_400Regular' },
  tabsScroll: { maxHeight: 46, marginBottom: 4 },
  tabsContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center', paddingVertical: 6 },
  tab: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 980, paddingHorizontal: 14, paddingVertical: 5, maxWidth: 140 },
  tabActive: { backgroundColor: 'rgba(128,0,0,0.75)', borderColor: 'transparent' },
  tabTxt: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.50)', fontFamily: 'Lexend_600SemiBold' },
  tabTxtActive: { color: '#fff' },
  scroll: { paddingHorizontal: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.20)', borderRadius: 18, padding: 14, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', letterSpacing: -0.5 },
  statLbl: { fontSize: 8.5, color: 'rgba(255,255,255,0.38)', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'Lexend_600SemiBold' },
  section: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: 18, padding: 14, marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12, fontFamily: 'Lexend_600SemiBold' },
  chartWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 4 },
  barCol: { flex: 1, alignItems: 'center', gap: 4 },
  barBg: { width: '100%', height: 60, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  barFill: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 8.5, color: 'rgba(255,255,255,0.35)', fontFamily: 'Lexend_400Regular' },
  barLabelToday: { color: '#fca5a5', fontWeight: '700' },
  barPct: { fontSize: 7.5, color: 'rgba(255,255,255,0.40)', fontFamily: 'Lexend_400Regular' },
  masteryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  masteryLabel: { width: 90, fontSize: 10, color: 'rgba(255,255,255,0.62)', fontFamily: 'Lexend_400Regular' },
  masteryBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 3, overflow: 'hidden' },
  masteryBarFill: { height: 6, borderRadius: 3 },
  masteryPct: { width: 32, fontSize: 10, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_600SemiBold', textAlign: 'right' },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  recentTitle: { fontSize: 12, fontWeight: '600', color: '#fff', fontFamily: 'Outfit_600SemiBold' },
  recentDate: { fontSize: 9.5, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', marginTop: 1 },
  recentBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, flexShrink: 0 },
  recentBadgeTxt: { fontSize: 10, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold', marginBottom: 6 },
  emptySub: { fontSize: 12, color: 'rgba(255,255,255,0.38)', fontFamily: 'Lexend_400Regular', textAlign: 'center' },
})
```

- [ ] **Step 2: Type-check + commit**

```
cd apps/mobile && npx tsc --noEmit
git add apps/mobile/app/(tabs)/analytics.tsx
git commit -m "feat(analytics): full analytics screen with weekly chart, topic mastery, recent sessions"
```

---

## Task 17: Home — Mini Progress Card

**Files:**
- Modify: `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Import useAnalytics**

In `apps/mobile/app/(tabs)/index.tsx`, add:

```ts
import { useAnalytics } from '../../hooks/useAnalytics'
```

- [ ] **Step 2: Call hook in HomeScreen**

Add inside `HomeScreen`:

```ts
  const { sessionCount, streak } = useAnalytics('overall')
```

- [ ] **Step 3: Add progress card below statsRow**

After the `</View>` closing the `statsRow`, add:

```tsx
          {/* Mini progress card */}
          {sessionCount > 0 && (
            <TouchableOpacity
              style={s.progressCard}
              onPress={() => router.push('/(tabs)/analytics')}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.progressTitle}>My Progress</Text>
                <Text style={s.progressSub}>
                  {sessionCount} session{sessionCount !== 1 ? 's' : ''}{streak > 0 ? ` · ${streak}🔥 streak` : ''}
                </Text>
              </View>
              <Text style={s.progressChevron}>›</Text>
            </TouchableOpacity>
          )}
```

- [ ] **Step 4: Add styles**

In `StyleSheet.create`, add:

```ts
  progressCard:    { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', borderRadius: 18, padding: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  progressTitle:   { fontSize: 12, fontWeight: '700', color: '#fff', fontFamily: 'Outfit_700Bold' },
  progressSub:     { fontSize: 10, color: 'rgba(255,255,255,0.50)', marginTop: 1, fontFamily: 'Lexend_400Regular' },
  progressChevron: { color: 'rgba(255,255,255,0.38)', fontSize: 20 },
```

- [ ] **Step 5: Run full test suite**

```
cd apps/mobile && npx jest
```

Expected: all tests pass (useFocusListings, useRecordSession, useAnalytics, and existing suites).

- [ ] **Step 6: Type-check**

```
cd apps/mobile && npx tsc --noEmit
```

- [ ] **Step 7: Final commit**

```
git add apps/mobile/app/(tabs)/index.tsx
git commit -m "feat(home): add mini progress card linking to Analytics tab"
```

---

## Post-Implementation Checklist

- [ ] Run `cd apps/mobile && npx jest` — all tests green
- [ ] Run `cd apps/mobile && npx tsc --noEmit` — no type errors
- [ ] Start app (`npx expo start --clear`) and verify:
  - New user onboarding: multi-select step 2 works, priority tray shows, assessDone lists focus
  - Practice tab: focus cards row appears, tapping switches Quick Start context
  - Full Review and Weak Topics deck routes launch and record sessions
  - Analytics tab: 5th tab visible, data populates after quiz
  - Listings tab: focus badges appear on in-focus listings
  - Listing detail: Add/Remove Focus CTA works
  - Profile: My Focus List section with ↑↓ reorder and ✕ remove
  - Home: progress card appears after first session, links to Analytics
