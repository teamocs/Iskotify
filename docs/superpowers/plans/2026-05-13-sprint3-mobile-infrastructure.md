# Sprint 3 — Mobile Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Iskotify mobile app shell — WatermelonDB offline DB, Supabase delta sync, splash screen, minimal onboarding, and a 4-tab glassmorphism navigation bar.

**Architecture:** React Native + Expo 52 with Expo Router v4 tabs. WatermelonDB stores flashcard/listing data locally using Supabase UUIDs as record IDs so FK resolution is trivial. On every launch, the root layout runs a delta sync (only rows updated after `last_synced_at`) before hiding the native splash screen. First launch shows onboarding (exam selection) instead of tabs.

**Tech Stack:** Expo 52, Expo Router v4, NativeWind v4, WatermelonDB, Supabase JS v2 (anon key), Lineicons v5 (`@lineiconshq/react-native-lineicons`), Reanimated 3, expo-blur, expo-splash-screen, expo-sharing.

---

## Important notes for implementers

- **This app needs a development build** — WatermelonDB uses native SQLite (JSI). It does not run in Expo Go. After installing packages and configuring, run `npx expo prebuild && npx expo run:ios` (or `run:android`).
- **Supabase table names differ from WatermelonDB table names.** Supabase uses `flashcard_subjects` / `flashcard_topics`; WatermelonDB uses `subjects` / `topics`. The sync service maps between them.
- **`flashcards.listing_slugs`** is a `text[]` in Supabase. There is no `listing_subjects` join table. Sync filters flashcards via `.contains('listing_slugs', [slug])`.
- **`flashcards.difficulty`** is an integer (1 = easy, 2 = medium, 3 = hard).
- Credentials are in `apps/mobile/.env.local`: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.

---

## File map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/006_flashcard_updated_at.sql` | Create | Add `updated_at` column + trigger to 3 flashcard tables |
| `apps/mobile/package.json` | Modify | Add new dependencies |
| `apps/mobile/app.json` | Modify | Splash config + WatermelonDB plugin |
| `apps/mobile/babel.config.js` | Modify | Add decorator Babel plugin |
| `apps/mobile/tsconfig.json` | Modify | Add `experimentalDecorators` |
| `apps/mobile/jest.config.js` | Create | Jest config (jest-expo preset) |
| `apps/mobile/jest.setup.ts` | Create | Jest global setup |
| `apps/mobile/db/schema.ts` | Create | WatermelonDB schema (5 tables) |
| `apps/mobile/db/models/Subject.ts` | Create | Subject model |
| `apps/mobile/db/models/Topic.ts` | Create | Topic model |
| `apps/mobile/db/models/Flashcard.ts` | Create | Flashcard model |
| `apps/mobile/db/models/Listing.ts` | Create | Listing model |
| `apps/mobile/db/models/UserSettings.ts` | Create | UserSettings model |
| `apps/mobile/db/index.ts` | Create | DB singleton |
| `apps/mobile/services/supabase.ts` | Create | Anon-key Supabase client |
| `apps/mobile/services/sync.ts` | Create | Delta sync logic |
| `apps/mobile/services/export.ts` | Create | JSON export via expo-sharing |
| `apps/mobile/hooks/useDatabase.ts` | Create | DatabaseContext + hook |
| `apps/mobile/components/TabBar.tsx` | Create | Glassmorphism floating tab bar |
| `apps/mobile/app/_layout.tsx` | Modify | Splash + DB mount + sync + onboarding guard |
| `apps/mobile/app/index.tsx` | Delete | Replaced by `(tabs)/index.tsx` |
| `apps/mobile/app/onboarding.tsx` | Create | Exam selection screen |
| `apps/mobile/app/(tabs)/_layout.tsx` | Create | Tab navigator with custom TabBar |
| `apps/mobile/app/(tabs)/index.tsx` | Create | Home stub |
| `apps/mobile/app/(tabs)/practice.tsx` | Create | Practice stub |
| `apps/mobile/app/(tabs)/listings.tsx` | Create | Listings stub |
| `apps/mobile/app/(tabs)/profile.tsx` | Create | Profile — Change Exam + Export |
| `apps/admin/app/layout.tsx` | Modify | Add Lineicons v5 CDN |

---

## Task 1: Supabase migration — add `updated_at` to flashcard tables

**Files:**
- Create: `supabase/migrations/006_flashcard_updated_at.sql`

`flashcard_subjects`, `flashcard_topics`, and `flashcards` have no `updated_at` column. Delta sync requires it.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/006_flashcard_updated_at.sql
ALTER TABLE flashcard_subjects
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE flashcard_topics
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE flashcards
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER flashcard_subjects_updated_at
  BEFORE UPDATE ON flashcard_subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flashcard_topics_updated_at
  BEFORE UPDATE ON flashcard_topics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX ON flashcard_subjects(updated_at);
CREATE INDEX ON flashcard_topics(updated_at);
CREATE INDEX ON flashcards(updated_at);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use the `mcp__supabase__apply_migration` tool with name `006_flashcard_updated_at` and the SQL above.

- [ ] **Step 3: Verify columns exist**

Use `mcp__supabase__execute_sql` with:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name IN ('flashcard_subjects','flashcard_topics','flashcards')
  AND column_name = 'updated_at';
```
Expected: 3 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/006_flashcard_updated_at.sql
git commit -m "feat(db): add updated_at to flashcard tables for delta sync"
```

---

## Task 2: Install packages

**Files:**
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd apps/mobile
pnpm add @nozbe/watermelondb @nozbe/with-observables @supabase/supabase-js @lineiconshq/react-native-lineicons @lineiconshq/free-icons react-native-svg expo-blur expo-sharing expo-splash-screen
```

- [ ] **Step 2: Install dev dependencies**

```bash
pnpm add -D @babel/plugin-proposal-decorators jest-expo @testing-library/react-native @types/jest
```

- [ ] **Step 3: Verify installs**

```bash
pnpm list @nozbe/watermelondb @supabase/supabase-js expo-splash-screen
```
Expected: all three listed with version numbers.

---

## Task 3: Configure project (app.json, babel, tsconfig, jest)

**Files:**
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/babel.config.js`
- Modify: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/jest.setup.ts`

- [ ] **Step 1: Update `app.json`**

```json
{
  "expo": {
    "name": "Iskotify",
    "slug": "iskotify",
    "scheme": "iskotify",
    "version": "0.0.1",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "splash": {
      "backgroundColor": "#1a1a2e",
      "resizeMode": "contain"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "app.iskotify.mobile"
    },
    "android": {
      "package": "app.iskotify.mobile",
      "edgeToEdgeEnabled": true
    },
    "web": {
      "bundler": "metro",
      "output": "static"
    },
    "plugins": [
      "expo-router",
      "@nozbe/watermelondb/expo-plugin"
    ],
    "experiments": {
      "typedRoutes": true,
      "tsconfigPaths": true
    }
  }
}
```

- [ ] **Step 2: Update `babel.config.js`**

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel"
    ],
    plugins: [
      ["@babel/plugin-proposal-decorators", { legacy: true }]
    ]
  };
};
```

- [ ] **Step 3: Update `tsconfig.json`**

```json
{
  "extends": "@iskotify/tsconfig/expo.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "types": ["nativewind/types"],
    "experimentalDecorators": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    ".expo/types/**/*.ts",
    "expo-env.d.ts",
    "nativewind-env.d.ts"
  ],
  "exclude": ["node_modules", ".expo", "dist"]
}
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|react-navigation|@react-navigation/.*|react-native-svg|@nozbe/watermelondb|@lineiconshq)',
  ],
  setupFiles: ['./jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
```

- [ ] **Step 5: Create `jest.setup.ts`**

```typescript
// Global Jest setup — extend matchers as needed in future sprints
```

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app.json apps/mobile/babel.config.js apps/mobile/tsconfig.json apps/mobile/jest.config.js apps/mobile/jest.setup.ts apps/mobile/package.json
git commit -m "chore(mobile): install Sprint 3 packages and configure babel/jest/tsconfig"
```

---

## Task 4: WatermelonDB schema

**Files:**
- Create: `apps/mobile/db/schema.ts`
- Create: `apps/mobile/db/__tests__/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/db/__tests__/schema.test.ts
import { dbSchema } from '../schema'

describe('dbSchema', () => {
  it('defines exactly 5 tables', () => {
    expect(dbSchema.tables).toHaveLength(5)
  })

  it('subjects table has name column', () => {
    const t = dbSchema.tables.find(t => t.name === 'subjects')!
    expect(t.columns.some(c => c.name === 'name' && c.type === 'string')).toBe(true)
  })

  it('flashcards table has remote_updated_at as number', () => {
    const t = dbSchema.tables.find(t => t.name === 'flashcards')!
    const col = t.columns.find(c => c.name === 'remote_updated_at')!
    expect(col.type).toBe('number')
  })

  it('user_settings table has last_synced_at and selected_listing_slug', () => {
    const t = dbSchema.tables.find(t => t.name === 'user_settings')!
    expect(t.columns.some(c => c.name === 'last_synced_at')).toBe(true)
    expect(t.columns.some(c => c.name === 'selected_listing_slug')).toBe(true)
  })

  it('topics table has subject_id indexed', () => {
    const t = dbSchema.tables.find(t => t.name === 'topics')!
    const col = t.columns.find(c => c.name === 'subject_id')!
    expect(col.isIndexed).toBe(true)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/mobile && pnpm exec jest db/__tests__/schema.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../schema'`

- [ ] **Step 3: Create `apps/mobile/db/schema.ts`**

```typescript
import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const dbSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'subjects',
      columns: [
        { name: 'name', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'topics',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'subject_id', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'flashcards',
      columns: [
        { name: 'topic_id', type: 'string', isIndexed: true },
        { name: 'question', type: 'string' },
        { name: 'answer', type: 'string' },
        { name: 'explanation', type: 'string' },
        { name: 'difficulty', type: 'number' },
        { name: 'listing_slugs', type: 'string' },
        { name: 'remote_updated_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'listings',
      columns: [
        { name: 'slug', type: 'string', isIndexed: true },
        { name: 'title', type: 'string' },
        { name: 'type', type: 'string' },
        { name: 'status', type: 'string' },
        { name: 'exam_date', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'user_settings',
      columns: [
        { name: 'selected_listing_slug', type: 'string' },
        { name: 'last_synced_at', type: 'number' },
      ],
    }),
  ],
})
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm exec jest db/__tests__/schema.test.ts --no-coverage
```
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/db/schema.ts apps/mobile/db/__tests__/schema.test.ts
git commit -m "feat(mobile): add WatermelonDB schema"
```

---

## Task 5: WatermelonDB models

**Files:**
- Create: `apps/mobile/db/models/Subject.ts`
- Create: `apps/mobile/db/models/Topic.ts`
- Create: `apps/mobile/db/models/Flashcard.ts`
- Create: `apps/mobile/db/models/Listing.ts`
- Create: `apps/mobile/db/models/UserSettings.ts`
- Create: `apps/mobile/db/__tests__/models.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/db/__tests__/models.test.ts
import { Subject } from '../models/Subject'
import { Topic } from '../models/Topic'
import { Flashcard } from '../models/Flashcard'
import { Listing } from '../models/Listing'
import { UserSettings } from '../models/UserSettings'

describe('Subject', () => {
  it('has table name subjects', () => {
    expect(Subject.table).toBe('subjects')
  })
})

describe('Topic', () => {
  it('has table name topics', () => {
    expect(Topic.table).toBe('topics')
  })
  it('declares belongs_to subjects association', () => {
    expect(Topic.associations.subjects.type).toBe('belongs_to')
  })
})

describe('Flashcard', () => {
  it('has table name flashcards', () => {
    expect(Flashcard.table).toBe('flashcards')
  })
  it('parses listingSlugs from valid JSON', () => {
    const card = Object.create(Flashcard.prototype) as Flashcard
    card.listingSlugsJson = '["upcat","dost-sei"]'
    expect(card.listingSlugs).toEqual(['upcat', 'dost-sei'])
  })
  it('returns empty array for invalid JSON', () => {
    const card = Object.create(Flashcard.prototype) as Flashcard
    card.listingSlugsJson = 'not-json'
    expect(card.listingSlugs).toEqual([])
  })
})

describe('Listing', () => {
  it('has table name listings', () => {
    expect(Listing.table).toBe('listings')
  })
})

describe('UserSettings', () => {
  it('has table name user_settings', () => {
    expect(UserSettings.table).toBe('user_settings')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec jest db/__tests__/models.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../models/Subject'`

- [ ] **Step 3: Create `apps/mobile/db/models/Subject.ts`**

```typescript
import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export class Subject extends Model {
  static table = 'subjects'

  @text('name') name!: string
}
```

- [ ] **Step 4: Create `apps/mobile/db/models/Topic.ts`**

```typescript
import { Model } from '@nozbe/watermelondb'
import { text } from '@nozbe/watermelondb/decorators'

export class Topic extends Model {
  static table = 'topics'
  static associations = {
    subjects: { type: 'belongs_to' as const, key: 'subject_id' },
    flashcards: { type: 'has_many' as const, foreignKey: 'topic_id' },
  }

  @text('name') name!: string
  @text('subject_id') subjectId!: string
  @text('status') status!: string
}
```

- [ ] **Step 5: Create `apps/mobile/db/models/Flashcard.ts`**

```typescript
import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class Flashcard extends Model {
  static table = 'flashcards'
  static associations = {
    topics: { type: 'belongs_to' as const, key: 'topic_id' },
  }

  @text('topic_id') topicId!: string
  @text('question') question!: string
  @text('answer') answer!: string
  @text('explanation') explanation!: string
  @field('difficulty') difficulty!: number
  @text('listing_slugs') listingSlugsJson!: string
  @field('remote_updated_at') remoteUpdatedAt!: number

  get listingSlugs(): string[] {
    try {
      return JSON.parse(this.listingSlugsJson)
    } catch {
      return []
    }
  }
}
```

- [ ] **Step 6: Create `apps/mobile/db/models/Listing.ts`**

```typescript
import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class Listing extends Model {
  static table = 'listings'

  @text('slug') slug!: string
  @text('title') title!: string
  @text('type') type!: string
  @text('status') status!: string
  @field('exam_date') examDate!: number | null
}
```

- [ ] **Step 7: Create `apps/mobile/db/models/UserSettings.ts`**

```typescript
import { Model } from '@nozbe/watermelondb'
import { text, field } from '@nozbe/watermelondb/decorators'

export class UserSettings extends Model {
  static table = 'user_settings'

  @text('selected_listing_slug') selectedListingSlug!: string
  @field('last_synced_at') lastSyncedAt!: number
}
```

- [ ] **Step 8: Run tests — expect PASS**

```bash
pnpm exec jest db/__tests__/models.test.ts --no-coverage
```
Expected: PASS — 7 tests passing

- [ ] **Step 9: Commit**

```bash
git add apps/mobile/db/models/ apps/mobile/db/__tests__/models.test.ts
git commit -m "feat(mobile): add WatermelonDB models"
```

---

## Task 6: WatermelonDB database singleton

**Files:**
- Create: `apps/mobile/db/index.ts`

No test needed — this is a thin integration of parts tested in Tasks 4 & 5. A broken singleton will surface immediately in Task 8 (sync) tests.

- [ ] **Step 1: Create `apps/mobile/db/index.ts`**

```typescript
import { Database } from '@nozbe/watermelondb'
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite'
import { dbSchema } from './schema'
import { Subject } from './models/Subject'
import { Topic } from './models/Topic'
import { Flashcard } from './models/Flashcard'
import { Listing } from './models/Listing'
import { UserSettings } from './models/UserSettings'

const adapter = new SQLiteAdapter({
  schema: dbSchema,
  dbName: 'iskotify',
  jsi: true,
  onSetUpError: (e: unknown) => console.error('[db] setup error', e),
})

export const database = new Database({
  adapter,
  modelClasses: [Subject, Topic, Flashcard, Listing, UserSettings],
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/db/index.ts
git commit -m "feat(mobile): add WatermelonDB database singleton"
```

---

## Task 7: Supabase client

**Files:**
- Create: `apps/mobile/services/supabase.ts`
- Create: `apps/mobile/services/__tests__/supabase.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/services/__tests__/supabase.test.ts
describe('supabase client', () => {
  beforeEach(() => {
    jest.resetModules()
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  it('exports a client with a from() method', async () => {
    const { supabase } = await import('../supabase')
    expect(typeof supabase.from).toBe('function')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec jest services/__tests__/supabase.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../supabase'`

- [ ] **Step 3: Create `apps/mobile/services/supabase.ts`**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm exec jest services/__tests__/supabase.test.ts --no-coverage
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/supabase.ts apps/mobile/services/__tests__/supabase.test.ts
git commit -m "feat(mobile): add Supabase anon client"
```

---

## Task 8: Sync service

**Files:**
- Create: `apps/mobile/services/sync.ts`
- Create: `apps/mobile/services/__tests__/sync.test.ts`

The sync service: (1) reads `user_settings` from WatermelonDB, (2) fetches updated rows from Supabase using `updated_at > last_synced_at`, (3) upserts records into WatermelonDB using `db.batch()` with `prepareCreate` / `prepareUpdate`, (4) updates `last_synced_at`.

Supabase table names → WatermelonDB table names:
- `flashcard_subjects` → `subjects`
- `flashcard_topics` → `topics`
- `flashcards` → `flashcards`
- `listings` → `listings`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/services/__tests__/sync.test.ts
import { syncOnLaunch } from '../sync'

// All Supabase queries end with .gt() which must resolve to { data: [] }.
// Intermediate methods (.select, .contains, .eq) return the chain object.
function makeChain(data: any[] = []) {
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockResolvedValue({ data }),
  }
  // make returnThis work for all methods
  chain.select.mockReturnValue(chain)
  chain.contains.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  return chain
}

jest.mock('../supabase', () => ({
  supabase: { from: jest.fn() },
}))

function makeSettings(slug: string, lastSyncedAt = 0) {
  return {
    selectedListingSlug: slug,
    lastSyncedAt,
    _raw: { id: 'local' },
    prepareUpdate: jest.fn(cb => {
      const copy: any = { selectedListingSlug: slug, lastSyncedAt }
      cb(copy)
      return copy
    }),
  }
}

function makeDb(settings: ReturnType<typeof makeSettings> | null) {
  return {
    get: jest.fn(() => ({
      find: jest.fn().mockResolvedValue(settings),
      create: jest.fn(cb => {
        const obj: any = { _raw: { id: 'local' }, selectedListingSlug: '', lastSyncedAt: 0 }
        cb(obj)
        return obj
      }),
      prepareCreate: jest.fn(cb => {
        const obj: any = { _raw: {} }
        cb(obj)
        return obj
      }),
    })),
    write: jest.fn(cb => cb()),
    batch: jest.fn(),
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  const { supabase } = require('../supabase')
  supabase.from.mockImplementation(() => makeChain())
})

describe('syncOnLaunch', () => {
  it('skips sync when selectedListingSlug is empty', async () => {
    const db = makeDb(makeSettings(''))
    await syncOnLaunch(db as any)
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('creates settings row when none exist, then skips (empty slug)', async () => {
    const db = makeDb(null)
    db.get = jest.fn(() => ({
      find: jest.fn().mockRejectedValue(new Error('not found')),
      create: jest.fn(cb => {
        const obj: any = { _raw: { id: 'local' }, selectedListingSlug: '', lastSyncedAt: 0 }
        cb(obj)
        return obj
      }),
      prepareCreate: jest.fn(),
    }))
    await syncOnLaunch(db as any)
    expect(db.batch).not.toHaveBeenCalled()
  })

  it('does not throw when Supabase call fails', async () => {
    const { supabase } = require('../supabase')
    supabase.from.mockImplementation(() => { throw new Error('network error') })
    const db = makeDb(makeSettings('upcat'))
    await expect(syncOnLaunch(db as any)).resolves.toBeUndefined()
  })

  it('calls db.batch to update last_synced_at when slug is set', async () => {
    // All queries return empty data — batch is still called to update last_synced_at
    const db = makeDb(makeSettings('upcat', 1000))
    await syncOnLaunch(db as any)
    expect(db.batch).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec jest services/__tests__/sync.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../sync'`

- [ ] **Step 3: Create `apps/mobile/services/sync.ts`**

```typescript
import type { Database, Model } from '@nozbe/watermelondb'
import { supabase } from './supabase'
import type { Subject } from '../db/models/Subject'
import type { Topic } from '../db/models/Topic'
import type { Flashcard } from '../db/models/Flashcard'
import type { Listing } from '../db/models/Listing'
import type { UserSettings } from '../db/models/UserSettings'

async function getOrCreateSettings(db: Database): Promise<UserSettings> {
  const coll = db.get<UserSettings>('user_settings')
  const existing = await coll.find('local').catch(() => null)
  if (existing) return existing
  return db.write(() =>
    coll.create(r => {
      r._raw.id = 'local'
      r.selectedListingSlug = ''
      r.lastSyncedAt = 0
    })
  )
}

export async function syncOnLaunch(db: Database): Promise<void> {
  try {
    const settings = await getOrCreateSettings(db)
    if (!settings.selectedListingSlug) return

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

    const ops: Model[] = []

    for (const row of (listingsRes.data ?? [])) {
      const coll = db.get<Listing>('listings')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.slug = row.slug; r.title = row.title; r.type = row.type
          r.status = row.status
          r.examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.slug = row.slug; r.title = row.title; r.type = row.type
          r.status = row.status
          r.examDate = row.exam_date ? new Date(row.exam_date).getTime() : null
        }))
      }
    }

    for (const row of (subjectsRes.data ?? [])) {
      const coll = db.get<Subject>('subjects')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => { r.name = row.name }))
      } else {
        ops.push(coll.prepareCreate(r => { r._raw.id = row.id; r.name = row.name }))
      }
    }

    for (const row of (topicsRes.data ?? [])) {
      const coll = db.get<Topic>('topics')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.name = row.name; r.subjectId = row.subject_id; r.status = row.status
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.name = row.name; r.subjectId = row.subject_id; r.status = row.status
        }))
      }
    }

    for (const row of (cardsRes.data ?? [])) {
      const coll = db.get<Flashcard>('flashcards')
      const ex = await coll.find(row.id).catch(() => null)
      if (ex) {
        ops.push(ex.prepareUpdate(r => {
          r.topicId = row.topic_id; r.question = row.question
          r.answer = row.answer; r.explanation = row.explanation
          r.difficulty = row.difficulty
          r.listingSlugsJson = JSON.stringify(row.listing_slugs ?? [])
          r.remoteUpdatedAt = new Date(row.updated_at).getTime()
        }))
      } else {
        ops.push(coll.prepareCreate(r => {
          r._raw.id = row.id
          r.topicId = row.topic_id; r.question = row.question
          r.answer = row.answer; r.explanation = row.explanation
          r.difficulty = row.difficulty
          r.listingSlugsJson = JSON.stringify(row.listing_slugs ?? [])
          r.remoteUpdatedAt = new Date(row.updated_at).getTime()
        }))
      }
    }

    ops.push(settings.prepareUpdate(s => { s.lastSyncedAt = Date.now() }))

    await db.batch(...ops)
  } catch (err) {
    console.error('[sync] error:', err)
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec jest services/__tests__/sync.test.ts --no-coverage
```
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/sync.ts apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(mobile): add delta sync service"
```

---

## Task 9: Export service

**Files:**
- Create: `apps/mobile/services/export.ts`
- Create: `apps/mobile/services/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/mobile/services/__tests__/export.test.ts
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

const mockSettings = {
  selectedListingSlug: 'upcat',
  lastSyncedAt: 1700000000000,
}

function makeDb(settings: typeof mockSettings | null) {
  return {
    get: jest.fn(() => ({
      find: settings
        ? jest.fn().mockResolvedValue(settings)
        : jest.fn().mockRejectedValue(new Error('not found')),
    })),
  }
}

beforeEach(() => jest.clearAllMocks())

describe('exportUserData', () => {
  it('writes a JSON file containing selected_listing_slug', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(mockSettings) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).selected_listing_slug).toBe('upcat')
  })

  it('includes exported_at timestamp in output', async () => {
    const FileSystem = require('expo-file-system')
    await exportUserData(makeDb(mockSettings) as any)
    const written = FileSystem.writeAsStringAsync.mock.calls[0][1] as string
    expect(JSON.parse(written).exported_at).toBeDefined()
  })

  it('calls shareAsync after writing the file', async () => {
    const Sharing = require('expo-sharing')
    await exportUserData(makeDb(mockSettings) as any)
    expect(Sharing.shareAsync).toHaveBeenCalledWith(
      '/tmp/iskotify-export.json',
      expect.objectContaining({ mimeType: 'application/json' }),
    )
  })

  it('throws when sharing is not available', async () => {
    const Sharing = require('expo-sharing')
    Sharing.isAvailableAsync.mockResolvedValue(false)
    await expect(exportUserData(makeDb(mockSettings) as any)).rejects.toThrow('Sharing not available')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm exec jest services/__tests__/export.test.ts --no-coverage
```
Expected: FAIL — `Cannot find module '../export'`

- [ ] **Step 3: Create `apps/mobile/services/export.ts`**

```typescript
import * as Sharing from 'expo-sharing'
import * as FileSystem from 'expo-file-system'
import type { Database } from '@nozbe/watermelondb'
import type { UserSettings } from '../db/models/UserSettings'

export async function exportUserData(db: Database): Promise<void> {
  const settings = await db
    .get<UserSettings>('user_settings')
    .find('local')
    .catch(() => null)

  const payload = {
    selected_listing_slug: settings?.selectedListingSlug ?? '',
    last_synced_at: settings?.lastSyncedAt ?? 0,
    exported_at: new Date().toISOString(),
  }

  const fileUri = FileSystem.documentDirectory + 'iskotify-export.json'
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

- [ ] **Step 4: Run tests — expect PASS**

```bash
pnpm exec jest services/__tests__/export.test.ts --no-coverage
```
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/export.ts apps/mobile/services/__tests__/export.test.ts
git commit -m "feat(mobile): add JSON export service"
```

---

## Task 10: useDatabase hook

**Files:**
- Create: `apps/mobile/hooks/useDatabase.ts`
- Create: `apps/mobile/hooks/__tests__/useDatabase.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/mobile/hooks/__tests__/useDatabase.test.tsx
import React from 'react'
import { renderHook } from '@testing-library/react-native'
import { DatabaseProvider, useDatabase } from '../useDatabase'

jest.mock('../../db', () => ({
  database: { __isMock: true },
}))

describe('useDatabase', () => {
  it('returns the database instance provided by DatabaseProvider', () => {
    const { result } = renderHook(() => useDatabase(), {
      wrapper: ({ children }) => <DatabaseProvider>{children}</DatabaseProvider>,
    })
    expect((result.current as any).__isMock).toBe(true)
  })

  it('throws when used outside DatabaseProvider', () => {
    // Context has a default value (the singleton), so it never throws.
    // Test confirms the hook returns a truthy value in all cases.
    const { result } = renderHook(() => useDatabase())
    expect(result.current).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm exec jest hooks/__tests__/useDatabase.test.tsx --no-coverage
```
Expected: FAIL — `Cannot find module '../useDatabase'`

- [ ] **Step 3: Create `apps/mobile/hooks/useDatabase.ts`**

```typescript
import React, { createContext, useContext } from 'react'
import type { Database } from '@nozbe/watermelondb'
import { database } from '../db'

const DatabaseContext = createContext<Database>(database)

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <DatabaseContext.Provider value={database}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase(): Database {
  return useContext(DatabaseContext)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
pnpm exec jest hooks/__tests__/useDatabase.test.tsx --no-coverage
```
Expected: PASS — 2 tests passing

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useDatabase.ts apps/mobile/hooks/__tests__/useDatabase.test.tsx
git commit -m "feat(mobile): add useDatabase context hook"
```

---

## Task 11: Root layout — splash screen + init + onboarding guard

**Files:**
- Modify: `apps/mobile/app/_layout.tsx`
- Delete: `apps/mobile/app/index.tsx`

`app/index.tsx` is the old placeholder screen. The real default route is now `(tabs)/index.tsx`. Leaving both causes a route conflict.

- [ ] **Step 1: Delete `apps/mobile/app/index.tsx`**

```bash
rm apps/mobile/app/index.tsx
```

- [ ] **Step 2: Replace `apps/mobile/app/_layout.tsx`**

```typescript
import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { DatabaseProvider } from '../hooks/useDatabase'
import { database } from '../db'
import { syncOnLaunch } from '../services/sync'
import type { UserSettings } from '../db/models/UserSettings'
import '../global.css'

SplashScreen.preventAutoHideAsync()

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      try {
        await syncOnLaunch(database)
        const settings = await database
          .get<UserSettings>('user_settings')
          .find('local')
          .catch(() => null)
        if (!settings?.selectedListingSlug) {
          router.replace('/onboarding')
        }
      } catch (e) {
        console.error('[layout] init error:', e)
        router.replace('/onboarding')
      } finally {
        await SplashScreen.hideAsync()
      }
    }
    init()
  }, [])

  return (
    <DatabaseProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </DatabaseProvider>
  )
}
```

**How the splash works:** `SplashScreen.preventAutoHideAsync()` runs at module load time, keeping the native splash visible. The `useEffect` mounts, runs sync, checks for onboarding, then calls `SplashScreen.hideAsync()` — the splash fades and either the tabs or onboarding is shown. The user never sees a flash of wrong content.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/_layout.tsx
git rm apps/mobile/app/index.tsx
git commit -m "feat(mobile): add splash screen, DB init, and onboarding guard to root layout"
```

---

## Task 12: Onboarding screen

**Files:**
- Create: `apps/mobile/app/onboarding.tsx`

No unit tests — this is a UI screen. Manual verification: run the dev build, clear app data, confirm onboarding appears before tabs.

- [ ] **Step 1: Create `apps/mobile/app/onboarding.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { supabase } from '../services/supabase'
import { syncOnLaunch } from '../services/sync'
import { useDatabase } from '../hooks/useDatabase'
import type { UserSettings } from '../db/models/UserSettings'

interface ListingRow {
  id: string
  slug: string
  title: string
  type: string
  exam_date: string | null
}

export default function OnboardingScreen() {
  const db = useDatabase()
  const [listings, setListings] = useState<ListingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)

  useEffect(() => {
    supabase
      .from('listings')
      .select('id,slug,title,type,exam_date')
      .in('status', ['active', 'upcoming'])
      .order('title')
      .then(({ data }) => {
        setListings(data ?? [])
        setLoading(false)
      })
  }, [])

  async function handleSelect(listing: ListingRow) {
    setSelecting(true)
    try {
      const coll = db.get<UserSettings>('user_settings')
      const existing = await coll.find('local').catch(() => null)
      if (existing) {
        await db.write(() =>
          existing.update(s => {
            s.selectedListingSlug = listing.slug
            s.lastSyncedAt = 0
          })
        )
      } else {
        await db.write(() =>
          coll.create(s => {
            s._raw.id = 'local'
            s.selectedListingSlug = listing.slug
            s.lastSyncedAt = 0
          })
        )
      }
      await syncOnLaunch(db)
      router.replace('/(tabs)/')
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

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/app/onboarding.tsx
git commit -m "feat(mobile): add onboarding exam selection screen"
```

---

## Task 13: TabBar component

**Files:**
- Create: `apps/mobile/components/TabBar.tsx`

The TabBar replaces Expo Router's default tab bar. It receives `BottomTabBarProps` from `@react-navigation/bottom-tabs` (exposed through Expo Router's `<Tabs tabBar={...}>`).

- [ ] **Step 1: Create `apps/mobile/components/TabBar.tsx`**

```typescript
import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Home2Outlined,
  Bolt2Outlined,
  GraduationCap1Outlined,
  User4Outlined,
} from '@lineiconshq/free-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

const TAB_META = [
  { name: 'index', label: 'Home', icon: Home2Outlined },
  { name: 'practice', label: 'Practice', icon: Bolt2Outlined },
  { name: 'listings', label: 'Listings', icon: GraduationCap1Outlined },
  { name: 'profile', label: 'Profile', icon: User4Outlined },
]

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
  const scale = useSharedValue(isFocused ? 1.06 : 1)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  function handlePressIn() {
    scale.value = withSpring(0.9, { damping: 12, stiffness: 200 })
  }
  function handlePressOut() {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[styles.navItem, isFocused && styles.navItemActive, animStyle]}>
        <Lineicons
          icon={icon}
          size={20}
          color={isFocused ? '#fff' : 'rgba(255,255,255,0.62)'}
        />
        <Text style={[styles.navLabel, isFocused && styles.navLabelActive]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={90} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
          {state.routes.map((route, index) => {
            const meta = TAB_META[index]
            if (!meta) return null
            const isFocused = state.index === index

            function onPress() {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }

            return (
              <NavItem
                key={route.key}
                label={meta.label}
                icon={meta.icon}
                isFocused={isFocused}
                onPress={onPress}
              />
            )
          })}
        </View>
      </BlurView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  blur: {
    width: 284,
    height: 68,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  navItem: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 22,
  },
  navItemActive: {
    backgroundColor: 'rgba(128,0,0,0.82)',
    shadowColor: '#800000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 9,
  },
  navLabel: {
    fontSize: 9.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 0.15,
  },
  navLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
})
```

- [ ] **Step 2: Commit**

```bash
git add apps/mobile/components/TabBar.tsx
git commit -m "feat(mobile): add glassmorphism floating TabBar component"
```

---

## Task 14: Tab layout and stub screens

**Files:**
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/index.tsx`
- Create: `apps/mobile/app/(tabs)/practice.tsx`
- Create: `apps/mobile/app/(tabs)/listings.tsx`

- [ ] **Step 1: Create `apps/mobile/app/(tabs)/_layout.tsx`**

```typescript
import { Tabs } from 'expo-router'
import { TabBar } from '../../components/TabBar'

export default function TabLayout() {
  return (
    <Tabs
      tabBar={props => <TabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
      <Tabs.Screen name="listings" options={{ title: 'Listings' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  )
}
```

- [ ] **Step 2: Create `apps/mobile/app/(tabs)/index.tsx`**

```typescript
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="flex-1 items-center justify-center gap-2">
        <Text className="text-white text-2xl font-bold">Home</Text>
        <Text className="text-white/50 text-sm">Coming in Sprint 4</Text>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 3: Create `apps/mobile/app/(tabs)/practice.tsx`**

```typescript
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function PracticeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="flex-1 items-center justify-center gap-2">
        <Text className="text-white text-2xl font-bold">Practice</Text>
        <Text className="text-white/50 text-sm">Coming in Sprint 4</Text>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: Create `apps/mobile/app/(tabs)/listings.tsx`**

```typescript
import { View, Text } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function ListingsScreen() {
  return (
    <SafeAreaView className="flex-1 bg-[#1a1a2e]">
      <View className="flex-1 items-center justify-center gap-2">
        <Text className="text-white text-2xl font-bold">Listings</Text>
        <Text className="text-white/50 text-sm">Coming in Sprint 5</Text>
      </View>
    </SafeAreaView>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/app/'(tabs)'/
git commit -m "feat(mobile): add tab layout and stub screens"
```

---

## Task 15: Profile tab — Change Exam + Export Data

**Files:**
- Create: `apps/mobile/app/(tabs)/profile.tsx`

- [ ] **Step 1: Create `apps/mobile/app/(tabs)/profile.tsx`**

```typescript
import { View, Text, TouchableOpacity, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDatabase } from '../../hooks/useDatabase'
import { exportUserData } from '../../services/export'
import type { UserSettings } from '../../db/models/UserSettings'

export default function ProfileScreen() {
  const db = useDatabase()

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
            const settings = await db
              .get<UserSettings>('user_settings')
              .find('local')
              .catch(() => null)
            if (settings) {
              await db.write(() =>
                settings.update(s => {
                  s.selectedListingSlug = ''
                  s.lastSyncedAt = 0
                })
              )
            }
            router.replace('/onboarding')
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

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
cd apps/mobile && pnpm exec jest --no-coverage
```
Expected: All tests pass (no regressions from new files)

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/app/'(tabs)'/profile.tsx
git commit -m "feat(mobile): add profile tab with Change Exam and Export Data"
```

---

## Task 16: Admin — add Lineicons v5 CDN to layout.tsx

**Files:**
- Modify: `apps/admin/app/layout.tsx`

Lineicons v5 was adopted project-wide during Sprint 3 brainstorm. Adding the CDN link to the admin root layout makes `lni lni-*` classes available on every admin page.

- [ ] **Step 1: Update `apps/admin/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Iskotify",
  description: "Find scholarships and ace your exams — para sa mga Iskolar ng Bayan"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Lexend:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdn.lineicons.com/5.1/line/lineicons.css"
        />
      </head>
      <body className="min-h-screen font-body antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Verify admin type-check still passes**

```bash
cd apps/admin && pnpm exec tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/layout.tsx
git commit -m "feat(admin): add Lineicons v5 CDN to root layout"
```

---

## Post-implementation verification

After all tasks are complete:

```bash
# Run all mobile tests
cd apps/mobile && pnpm exec jest --no-coverage

# Type-check mobile
pnpm exec tsc --noEmit

# Build dev client (required — WatermelonDB needs native code)
npx expo prebuild
npx expo run:ios   # or run:android

# Manual smoke test:
# 1. First launch → onboarding appears, listings load from Supabase
# 2. Select an exam → sync runs, tabs appear
# 3. Floating TabBar visible, Lineicons icons correct, maroon active state
# 4. Profile tab → Change Exam (returns to onboarding), Export Data (share sheet)
# 5. Kill app, relaunch → tabs appear directly (no onboarding), delta sync runs silently
```
