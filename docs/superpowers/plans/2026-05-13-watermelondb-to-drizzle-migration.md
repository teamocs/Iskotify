# WatermelonDB → expo-sqlite + Drizzle ORM Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace WatermelonDB with expo-sqlite + drizzle-orm so the Iskotify mobile app runs in Expo Go without a custom native build.

**Architecture:** `SQLiteProvider` (expo-sqlite) wraps the app root; `DrizzleProvider` inside it calls `createDrizzleClient()` which sets WAL mode, creates tables via `CREATE TABLE IF NOT EXISTS`, and returns a typed Drizzle client. All screens call `useDb()`. Sync and export services keep identical behavior, rewritten with Drizzle's INSERT/UPDATE/SELECT API.

**Tech Stack:** expo-sqlite ~14.0.6, drizzle-orm ^0.38.0, drizzle-kit ^0.29.0 (dev), Supabase JS v2, Jest + React Native Testing Library, Expo 52, Expo Router v4

---

## File Map

### Deleted
- `apps/mobile/android/` — Android prebuild (no longer needed for Expo Go)
- `apps/mobile/db/schema.ts` — WatermelonDB schema
- `apps/mobile/db/index.ts` — WatermelonDB database initializer
- `apps/mobile/db/models/Flashcard.ts`
- `apps/mobile/db/models/Listing.ts`
- `apps/mobile/db/models/Subject.ts`
- `apps/mobile/db/models/Topic.ts`
- `apps/mobile/db/models/UserSettings.ts`
- `apps/mobile/db/__tests__/schema.test.ts`
- `apps/mobile/db/__tests__/models.test.ts`
- `apps/mobile/hooks/useDatabase.tsx`
- `apps/mobile/hooks/__tests__/useDatabase.test.tsx`

### Created
- `apps/mobile/db/schema.ts` — Drizzle table definitions (6 tables)
- `apps/mobile/db/client.ts` — `createDrizzleClient`: WAL pragma + CREATE TABLE IF NOT EXISTS + drizzle()
- `apps/mobile/db/index.ts` — `DrizzleProvider` component + `DrizzleContext`
- `apps/mobile/hooks/useDb.ts` — `useDb()` hook
- `apps/mobile/hooks/__tests__/useDb.test.tsx` — useDb tests
- `apps/mobile/drizzle.config.ts` — drizzle-kit config (for future migrations)

### Modified
- `apps/mobile/package.json` — add expo-sqlite, drizzle-orm; remove watermelondb, with-observables
- `apps/mobile/babel.config.js` — remove @babel/plugin-proposal-decorators
- `apps/mobile/services/sync.ts` — rewrite with Drizzle
- `apps/mobile/services/__tests__/sync.test.ts` — rewrite tests
- `apps/mobile/services/export.ts` — rewrite with Drizzle
- `apps/mobile/services/__tests__/export.test.ts` — rewrite tests
- `apps/mobile/app/_layout.tsx` — SQLiteProvider + DrizzleProvider + AppInit pattern
- `apps/mobile/app/onboarding.tsx` — useDb() + Drizzle queries
- `apps/mobile/app/(tabs)/profile.tsx` — useDb() + Drizzle queries

---

### Task 1: Remove WatermelonDB files and Android artifacts

**Files:**
- Delete: `apps/mobile/android/`, `apps/mobile/db/models/`, `apps/mobile/db/schema.ts`, `apps/mobile/db/index.ts`, `apps/mobile/db/__tests__/schema.test.ts`, `apps/mobile/db/__tests__/models.test.ts`, `apps/mobile/hooks/useDatabase.tsx`, `apps/mobile/hooks/__tests__/useDatabase.test.tsx`
- Modify: `apps/mobile/package.json`, `apps/mobile/babel.config.js`

- [ ] **Step 1: Delete Android build directory and WatermelonDB files**

Run from `C:/Users/User/OneDrive/Desktop/IskotifyApp`:
```powershell
Remove-Item -Recurse -Force apps/mobile/android
Remove-Item -Recurse -Force apps/mobile/db/models
Remove-Item apps/mobile/db/schema.ts
Remove-Item apps/mobile/db/index.ts
Remove-Item apps/mobile/db/__tests__/schema.test.ts
Remove-Item apps/mobile/db/__tests__/models.test.ts
Remove-Item apps/mobile/hooks/useDatabase.tsx
Remove-Item apps/mobile/hooks/__tests__/useDatabase.test.tsx
```

- [ ] **Step 2: Update package.json — remove WatermelonDB packages**

Replace `apps/mobile/package.json` with:
```json
{
  "name": "@iskotify/mobile",
  "version": "0.0.1",
  "private": true,
  "main": "expo-router/entry",
  "scripts": {
    "dev": "expo start --clear",
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "web": "expo start --web",
    "build": "expo export",
    "lint": "tsc --noEmit",
    "type-check": "tsc --noEmit",
    "clean": "rimraf .expo .turbo dist"
  },
  "dependencies": {
    "@iskotify/ui": "workspace:*",
    "@iskotify/utils": "workspace:*",
    "@lineiconshq/free-icons": "^1.0.6",
    "@lineiconshq/react-native-lineicons": "^0.0.3",
    "@supabase/supabase-js": "^2.47.0",
    "drizzle-orm": "^0.38.0",
    "expo": "~52.0.23",
    "expo-blur": "^14.0.3",
    "expo-constants": "~17.0.4",
    "expo-linking": "~7.0.4",
    "expo-router": "~4.0.16",
    "expo-sharing": "^13.0.1",
    "expo-splash-screen": "^0.29.24",
    "expo-sqlite": "~15.1.2",
    "expo-status-bar": "~2.0.0",
    "nativewind": "^4.1.23",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-native": "0.76.5",
    "react-native-reanimated": "~3.16.1",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-svg": "^15.8.0",
    "react-native-web": "^0.19.13"
  },
  "devDependencies": {
    "@babel/core": "^7.26.0",
    "@iskotify/tsconfig": "workspace:*",
    "@testing-library/react-native": "^13.3.3",
    "@types/jest": "^30.0.0",
    "@types/react": "~18.3.12",
    "drizzle-kit": "^0.29.0",
    "jest-expo": "^52.0.6",
    "react-test-renderer": "18.3.1",
    "rimraf": "^6.0.1",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 3: Remove the decorators plugin from babel.config.js**

Replace `apps/mobile/babel.config.js` with:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel"
    ],
    plugins: [
      "react-native-reanimated/plugin"
    ]
  };
};
```

- [ ] **Step 4: Install updated dependencies**

Run from `C:/Users/User/OneDrive/Desktop/IskotifyApp`:
```bash
pnpm install
```
Expected: `@nozbe/watermelondb` and `@nozbe/with-observables` removed; `drizzle-orm`, `drizzle-kit`, `expo-sqlite` added; `pnpm-lock.yaml` updated.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/package.json apps/mobile/babel.config.js pnpm-lock.yaml
git commit -m "chore(mobile): remove WatermelonDB, Android artifacts, add Drizzle deps"
```

---

### Task 2: Drizzle schema + drizzle-kit config

**Files:**
- Create: `apps/mobile/db/schema.ts`
- Create: `apps/mobile/drizzle.config.ts`

- [ ] **Step 1: Write the failing type-check**

Run from `C:/Users/User/OneDrive/Desktop/IskotifyApp`:
```bash
pnpm -F @iskotify/mobile type-check
```
Expected: FAIL — many errors because `db/schema.ts`, `db/index.ts`, `hooks/useDb.ts` don't exist yet.

- [ ] **Step 2: Create db/schema.ts**

Create `apps/mobile/db/schema.ts`:
```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'

export const subjects = sqliteTable('subjects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

export const topics = sqliteTable('topics', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  subjectId: text('subject_id').notNull(),
  status: text('status').notNull(),
}, (t) => [
  index('topics_subject_id_idx').on(t.subjectId),
])

export const flashcards = sqliteTable('flashcards', {
  id: text('id').primaryKey(),
  topicId: text('topic_id').notNull(),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  explanation: text('explanation').notNull(),
  difficulty: integer('difficulty').notNull(),
  listingSlugs: text('listing_slugs').notNull().default('[]'),
  remoteUpdatedAt: integer('remote_updated_at'),
}, (t) => [
  index('flashcards_topic_id_idx').on(t.topicId),
])

export const listings = sqliteTable('listings', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  examDate: integer('exam_date'),
}, (t) => [
  index('listings_slug_idx').on(t.slug),
])

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
})

export const userProgress = sqliteTable('user_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flashcardId: text('flashcard_id').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  answeredAt: integer('answered_at').notNull(),
}, (t) => [
  index('user_progress_flashcard_id_idx').on(t.flashcardId),
])
```

- [ ] **Step 3: Create drizzle.config.ts**

Create `apps/mobile/drizzle.config.ts`:
```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './db/schema.ts',
  out: './db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/drizzle.config.ts
git commit -m "feat(mobile): add Drizzle schema (6 tables) and drizzle-kit config"
```

---

### Task 3: Database client + DrizzleProvider + useDb hook

**Files:**
- Create: `apps/mobile/db/client.ts`
- Create: `apps/mobile/db/index.ts`
- Create: `apps/mobile/hooks/useDb.ts`
- Create: `apps/mobile/hooks/__tests__/useDb.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/hooks/__tests__/useDb.test.tsx`:
```typescript
import React from 'react'
import { renderHook } from '@testing-library/react-native'
import { useDb } from '../useDb'

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(() => ({ execSync: jest.fn() })),
  SQLiteProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('../../db/client', () => ({
  createDrizzleClient: jest.fn(() => ({ __isDrizzle: true })),
}))

jest.mock('../../db', () => {
  const React = require('react')
  const { createDrizzleClient } = require('../../db/client')
  const { useSQLiteContext } = require('expo-sqlite')
  const DrizzleContext = React.createContext<any>(null)
  return {
    DrizzleProvider: ({ children }: { children: React.ReactNode }) => {
      const rawDb = useSQLiteContext()
      const db = React.useMemo(() => createDrizzleClient(rawDb), [rawDb])
      return React.createElement(DrizzleContext.Provider, { value: db }, children)
    },
    DrizzleContext,
  }
})

describe('useDb', () => {
  it('returns the drizzle client from DrizzleProvider', () => {
    const { DrizzleProvider } = require('../../db')
    const { result } = renderHook(() => useDb(), {
      wrapper: ({ children }) => React.createElement(DrizzleProvider, null, children),
    })
    expect((result.current as any).__isDrizzle).toBe(true)
  })

  it('throws when called outside DrizzleProvider', () => {
    expect(() => renderHook(() => useDb())).toThrow('useDb must be used within DrizzleProvider')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @iskotify/mobile test -- hooks/__tests__/useDb.test.tsx --no-coverage
```
Expected: FAIL — `useDb`, `DrizzleProvider`, `DrizzleContext`, `createDrizzleClient` not found.

- [ ] **Step 3: Create db/client.ts**

Create `apps/mobile/db/client.ts`:
```typescript
import { drizzle } from 'drizzle-orm/expo-sqlite'
import type { SQLiteDatabase } from 'expo-sqlite'
import * as schema from './schema'

const CREATE_SQL = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_subject_id_idx ON topics (subject_id);
CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY NOT NULL,
  topic_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  difficulty INTEGER NOT NULL,
  listing_slugs TEXT NOT NULL DEFAULT '[]',
  remote_updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS flashcards_topic_id_idx ON flashcards (topic_id);
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  exam_date INTEGER
);
CREATE INDEX IF NOT EXISTS listings_slug_idx ON listings (slug);
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  selected_listing_slug TEXT NOT NULL DEFAULT '',
  last_synced_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  flashcard_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  answered_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_progress_flashcard_id_idx ON user_progress (flashcard_id);
`

export function createDrizzleClient(rawDb: SQLiteDatabase) {
  rawDb.execSync(CREATE_SQL)
  return drizzle(rawDb, { schema })
}

export type DrizzleClient = ReturnType<typeof createDrizzleClient>
```

- [ ] **Step 4: Create db/index.ts**

Create `apps/mobile/db/index.ts`:
```typescript
import React, { createContext, useContext, useMemo } from 'react'
import { useSQLiteContext } from 'expo-sqlite'
import { createDrizzleClient, type DrizzleClient } from './client'

export const DrizzleContext = createContext<DrizzleClient | null>(null)

export function DrizzleProvider({ children }: { children: React.ReactNode }) {
  const rawDb = useSQLiteContext()
  const db = useMemo(() => createDrizzleClient(rawDb), [rawDb])
  return <DrizzleContext.Provider value={db}>{children}</DrizzleContext.Provider>
}
```

- [ ] **Step 5: Create hooks/useDb.ts**

Create `apps/mobile/hooks/useDb.ts`:
```typescript
import { useContext } from 'react'
import { DrizzleContext, type DrizzleClient } from '../db'

export function useDb(): DrizzleClient {
  const db = useContext(DrizzleContext)
  if (!db) throw new Error('useDb must be used within DrizzleProvider')
  return db
}
```

Wait — there's a circular import risk: `hooks/useDb.ts` imports from `db/index.ts` which imports from `db/client.ts`. This is fine since it's one-way. But the test mock above mocks `../../db` which is `db/index.ts`. That's correct.

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm -F @iskotify/mobile test -- hooks/__tests__/useDb.test.tsx --no-coverage
```
Expected: PASS — both tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/db/client.ts apps/mobile/db/index.ts apps/mobile/hooks/useDb.ts apps/mobile/hooks/__tests__/useDb.test.tsx
git commit -m "feat(mobile): add Drizzle client, DrizzleProvider, and useDb hook"
```

---

### Task 4: Update root layout with SQLiteProvider + DrizzleProvider

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`

- [ ] **Step 1: Replace _layout.tsx**

Replace `apps/mobile/app/_layout.tsx` with:
```typescript
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { SQLiteProvider } from 'expo-sqlite'
import { DrizzleProvider } from '../db'
import { useDb } from '../hooks/useDb'
import { syncOnLaunch } from '../services/sync'
import { userSettings } from '../db/schema'
import { eq } from 'drizzle-orm'
import '../global.css'

SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="iskotify.db" options={{ enableChangeListener: true }}>
      <DrizzleProvider>
        <AppInit />
      </DrizzleProvider>
    </SQLiteProvider>
  )
}

function AppInit() {
  const db = useDb()
  const [ready, setReady] = useState(false)

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
        await SplashScreen.hideAsync()
        setReady(true)
      }
    }
    void init()
  }, [])

  return (
    <>
      <StatusBar style="light" />
      {ready ? (
        <Stack screenOptions={{ headerShown: false }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: '#1a1a2e' }} />
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify no TypeScript errors in the layout**

```bash
pnpm -F @iskotify/mobile type-check
```
Expected: errors only in `services/sync.ts`, `services/export.ts`, `app/onboarding.tsx`, `app/(tabs)/profile.tsx` (not yet updated). No errors in `_layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git commit -m "feat(mobile): update root layout with SQLiteProvider + DrizzleProvider"
```

---

### Task 5: Rewrite sync service

**Files:**
- Modify: `apps/mobile/services/sync.ts`
- Modify: `apps/mobile/services/__tests__/sync.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/mobile/services/__tests__/sync.test.ts` with:
```typescript
import { syncOnLaunch } from '../sync'
import { userSettings } from '../../db/schema'

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn() },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val, __isEq: true })),
}))

function makeSupabaseChain(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
  }
  return chain
}

function makeSelectChain(rows: any[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

function makeTx() {
  const onConflictDoUpdate = jest.fn().mockResolvedValue(undefined)
  const values = jest.fn(() => ({ onConflictDoUpdate }))
  const insert = jest.fn(() => ({ values }))
  const set = jest.fn(() => ({ where: jest.fn().mockResolvedValue(undefined) }))
  const update = jest.fn(() => ({ set }))
  return { insert, update, onConflictDoUpdate }
}

function makeDb(settingsRow: object | null) {
  const tx = makeTx()
  return {
    select: jest.fn(() => makeSelectChain(settingsRow ? [settingsRow] : [])),
    transaction: jest.fn(async (cb: (tx: any) => Promise<void>) => {
      await cb(tx)
    }),
    _tx: tx,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeSupabaseChain())
})

describe('syncOnLaunch', () => {
  it('returns early when selectedListingSlug is empty', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: '', lastSyncedAt: 0 })
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('returns early when no settings row exists', async () => {
    const db = makeDb(null)
    await syncOnLaunch(db as any)
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it('calls supabase.from for all four tables when slug is set', async () => {
    const { supabase } = require('../supabase')
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 })
    await syncOnLaunch(db as any)
    expect(supabase.from).toHaveBeenCalledWith('listings')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_subjects')
    expect(supabase.from).toHaveBeenCalledWith('flashcard_topics')
    expect(supabase.from).toHaveBeenCalledWith('flashcards')
  })

  it('calls db.transaction when slug is set', async () => {
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 1000 })
    await syncOnLaunch(db as any)
    expect(db.transaction).toHaveBeenCalledTimes(1)
  })

  it('does not throw when supabase fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network') })
    const db = makeDb({ id: 1, selectedListingSlug: 'upcat', lastSyncedAt: 0 })
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @iskotify/mobile test -- services/__tests__/sync.test.ts --no-coverage
```
Expected: FAIL — `syncOnLaunch` still imports WatermelonDB.

- [ ] **Step 3: Rewrite services/sync.ts**

Replace `apps/mobile/services/sync.ts` with:
```typescript
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { subjects, topics, flashcards, listings, userSettings } from '../db/schema'
import { supabase } from './supabase'

export async function syncOnLaunch(db: DrizzleClient): Promise<void> {
  try {
    const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
    const settings = rows[0]
    if (!settings?.selectedListingSlug) return

    const since = settings.lastSyncedAt === 0
      ? '1970-01-01T00:00:00.000Z'
      : new Date(settings.lastSyncedAt).toISOString()
    const slug = settings.selectedListingSlug

    const [listingsRes, subjectsRes, topicsRes, cardsRes] = await Promise.all([
      supabase.from('listings').select('id,slug,title,type,status,exam_date').gt('updated_at', since),
      supabase.from('flashcard_subjects').select('id,name').gt('updated_at', since),
      supabase.from('flashcard_topics').select('id,name,subject_id,status').gt('updated_at', since),
      supabase.from('flashcards')
        .select('id,topic_id,question,answer,explanation,difficulty,listing_slugs,updated_at')
        .contains('listing_slugs', [slug])
        .eq('status', 'published')
        .gt('updated_at', since),
    ])

    await db.transaction(async (tx) => {
      for (const row of (listingsRes.data ?? [])) {
        const examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        await tx.insert(listings)
          .values({ id: row.id, slug: row.slug, title: row.title, type: row.type, status: row.status, examDate })
          .onConflictDoUpdate({
            target: listings.id,
            set: { slug: row.slug, title: row.title, type: row.type, status: row.status, examDate },
          })
      }

      for (const row of (subjectsRes.data ?? [])) {
        await tx.insert(subjects)
          .values({ id: row.id, name: row.name })
          .onConflictDoUpdate({ target: subjects.id, set: { name: row.name } })
      }

      for (const row of (topicsRes.data ?? [])) {
        await tx.insert(topics)
          .values({ id: row.id, name: row.name, subjectId: row.subject_id, status: row.status })
          .onConflictDoUpdate({
            target: topics.id,
            set: { name: row.name, subjectId: row.subject_id, status: row.status },
          })
      }

      for (const row of (cardsRes.data ?? [])) {
        const remoteUpdatedAt = new Date(row.updated_at).getTime()
        await tx.insert(flashcards)
          .values({
            id: row.id,
            topicId: row.topic_id,
            question: row.question,
            answer: row.answer,
            explanation: row.explanation,
            difficulty: row.difficulty,
            listingSlugs: JSON.stringify(row.listing_slugs ?? []),
            remoteUpdatedAt,
          })
          .onConflictDoUpdate({
            target: flashcards.id,
            set: {
              topicId: row.topic_id,
              question: row.question,
              answer: row.answer,
              explanation: row.explanation,
              difficulty: row.difficulty,
              listingSlugs: JSON.stringify(row.listing_slugs ?? []),
              remoteUpdatedAt,
            },
          })
      }

      await tx.insert(userSettings)
        .values({ id: 1, selectedListingSlug: slug, lastSyncedAt: Date.now() })
        .onConflictDoUpdate({ target: userSettings.id, set: { lastSyncedAt: Date.now() } })
    })
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @iskotify/mobile test -- services/__tests__/sync.test.ts --no-coverage
```
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/sync.ts apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(mobile): rewrite sync service with Drizzle"
```

---

### Task 6: Rewrite export service

**Files:**
- Modify: `apps/mobile/services/export.ts`
- Modify: `apps/mobile/services/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `apps/mobile/services/__tests__/export.test.ts` with:
```typescript
import { exportUserData } from '../export'

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-file-system', () => ({
  documentDirectory: '/tmp/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  EncodingType: { UTF8: 'utf8' },
}))

jest.mock('drizzle-orm', () => ({
  eq: jest.fn((col, val) => ({ col, val })),
}))

function makeDb(settingsRow: { selectedListingSlug: string; lastSyncedAt: number } | null) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(settingsRow ? [settingsRow] : []),
        })),
      })),
    })),
  }
}

beforeEach(() => jest.clearAllMocks())

describe('exportUserData', () => {
  it('writes a JSON file containing selected_listing_slug', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 1700000000000 }) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('upcat')
  })

  it('includes exported_at timestamp in output', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).exported_at).toBeDefined()
  })

  it('calls shareAsync after writing the file', async () => {
    const Sharing = require('expo-sharing')
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/iskotify-export.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    )
  })

  it('throws when sharing is not available', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(
      exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    ).rejects.toThrow('Sharing not available')
  })

  it('uses empty slug when no settings row exists', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(null) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm -F @iskotify/mobile test -- services/__tests__/export.test.ts --no-coverage
```
Expected: FAIL — `exportUserData` still imports WatermelonDB.

- [ ] **Step 3: Rewrite services/export.ts**

Replace `apps/mobile/services/export.ts` with:
```typescript
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { userSettings } from '../db/schema'

export async function exportUserData(db: DrizzleClient): Promise<void> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  const settings = rows[0]

  const payload = {
    selected_listing_slug: settings?.selectedListingSlug ?? '',
    last_synced_at: settings?.lastSyncedAt ?? 0,
    exported_at: new Date().toISOString(),
  }

  const dir = FileSystem.documentDirectory
  if (!dir) throw new Error('File system not available on this platform')
  const fileUri = `${dir}iskotify-export.json`
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(payload, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  })

  const canShare = await Sharing.isAvailableAsync()
  if (!canShare) throw new Error('Sharing not available on this device')

  await Sharing.shareAsync(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Iskotify Data',
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm -F @iskotify/mobile test -- services/__tests__/export.test.ts --no-coverage
```
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/export.ts apps/mobile/services/__tests__/export.test.ts
git commit -m "feat(mobile): rewrite export service with Drizzle"
```

---

### Task 7: Update onboarding and profile screens

**Files:**
- Modify: `apps/mobile/app/onboarding.tsx`
- Modify: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Replace onboarding.tsx**

Replace `apps/mobile/app/onboarding.tsx` with:
```typescript
import { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { eq } from 'drizzle-orm'
import { supabase } from '../services/supabase'
import { syncOnLaunch } from '../services/sync'
import { useDb } from '../hooks/useDb'
import { userSettings } from '../db/schema'

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  exam_date: string | null
}

export default function OnboardingScreen() {
  const db = useDb()
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('listings')
      .select('id,slug,title,type,exam_date')
      .in('status', ['active', 'upcoming'])
      .order('title')
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('[onboarding] fetch listings error:', error)
        setListings(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  async function handleSelect(listing: ListingRow) {
    setSelecting(true)
    try {
      await db.insert(userSettings)
        .values({ id: 1, selectedListingSlug: listing.slug, lastSyncedAt: 0 })
        .onConflictDoUpdate({
          target: userSettings.id,
          set: { selectedListingSlug: listing.slug, lastSyncedAt: 0 },
        })
      await syncOnLaunch(db)
      router.replace('/(tabs)')
    } catch (e) {
      console.error('[onboarding] select error:', e)
    } finally {
      setSelecting(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#1a1a2e] items-center justify-center">
        <ActivityIndicator color="#fff" size="large" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="px-6 pt-8 pb-4">
        <Text className="text-white text-3xl font-bold">
          Which exam are you{'\n'}preparing for?
        </Text>
        <Text className="text-white/50 text-sm mt-2">
          You can change this later from your profile.
        </Text>
      </View>

      <FlatList
        data={listings}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => handleSelect(item)}
            disabled={selecting}
            className="bg-white/10 rounded-2xl p-4 mb-3 border border-white/20 active:bg-white/20"
          >
            <Text className="text-white font-semibold text-base">{item.title}</Text>
            {item.exam_date ? (
              <Text className="text-white/50 text-sm mt-1">
                {new Date(item.exam_date).toLocaleDateString('en-PH', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            ) : null}
          </TouchableOpacity>
        )}
      />

      {selecting ? (
        <View className="absolute inset-0 bg-black/50 items-center justify-center">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Replace profile.tsx**

Replace `apps/mobile/app/(tabs)/profile.tsx` with:
```typescript
import { View, Text, TouchableOpacity, Alert } from 'react-native'
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
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="flex-1 px-6 pt-8">
        <Text className="text-white text-3xl font-bold mb-8">Profile</Text>

        <TouchableOpacity
          onPress={handleChangeExam}
          className="bg-white/10 rounded-2xl p-4 mb-4 border border-white/20"
        >
          <Text className="text-white font-semibold text-base">Change Exam</Text>
          <Text className="text-white/50 text-sm mt-1">
            Select a different exam to study for
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleExport}
          className="bg-white/10 rounded-2xl p-4 border border-white/20"
        >
          <Text className="text-white font-semibold text-base">Export Data</Text>
          <Text className="text-white/50 text-sm mt-1">
            Save your preferences as a JSON file
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 3: Verify TypeScript is clean**

```bash
pnpm -F @iskotify/mobile type-check
```
Expected: PASS — zero type errors across all files.

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/onboarding.tsx "apps/mobile/app/(tabs)/profile.tsx"
git commit -m "feat(mobile): update screens to use Drizzle (onboarding + profile)"
```

---

### Task 8: Full test suite + Expo Go launch verification

**Files:** None modified — verification only.

- [ ] **Step 1: Run the full test suite**

```bash
pnpm -F @iskotify/mobile test --no-coverage
```
Expected: PASS — all tests pass. The passing tests are:
- `hooks/__tests__/useDb.test.tsx` (2 tests)
- `services/__tests__/sync.test.ts` (5 tests)
- `services/__tests__/export.test.ts` (5 tests)
- `services/__tests__/supabase.test.ts` (existing, untouched)

- [ ] **Step 2: Start Metro and verify Expo Go launches**

Run from `C:/Users/User/OneDrive/Desktop/IskotifyApp/apps/mobile`:
```bash
npx expo start --clear
```
Expected output:
```
Starting Metro Bundler
Waiting on http://localhost:8081
```
Open the Expo Go app on your phone, scan the QR code. The app should open showing the dark splash screen, then route to `/onboarding` (since the DB starts empty). No red error screen.

- [ ] **Step 3: Commit final state**

```bash
git add -A
git commit -m "chore(mobile): verify all tests pass and app runs in Expo Go"
```
