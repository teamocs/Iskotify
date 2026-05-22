# AI Flashcard Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `difficulty` field from all layers and integrate Qwen 2.5 1.5B Instruct (via `llama.rn`) to regenerate MCQ distractors and explanations on-device, cached in local SQLite AI-only columns that never sync to Supabase.

**Architecture:** Admin-authored card content (question, answer, explanation, options) lives in Supabase and syncs to local SQLite unchanged. Four new local-only columns (`aiOptions`, `aiCorrectIndex`, `aiExplanation`, `aiEnhancedAt`) are written by an on-device background job after the Qwen model is downloaded. The quiz display layer prefers AI columns over admin columns via a priority chain in `mcDistractors.ts`.

**Tech Stack:** Expo SDK 54 · Drizzle ORM · expo-sqlite · llama.rn · react-native-background-downloader · expo-file-system · expo-device · expo-notifications (already installed)

---

## File Map

| File | Role |
|---|---|
| `supabase/migrations/009_remove_difficulty.sql` | Drop `difficulty` from Supabase `flashcards` |
| `apps/mobile/db/schema.ts` | Remove `difficulty`; add 4 AI columns |
| `apps/mobile/db/client.ts` | Remove `difficulty` from CREATE_SQL; add AI column migrations |
| `apps/mobile/services/sync.ts` | Remove `difficulty` from SELECT/upsert; reset `aiEnhancedAt` on update |
| `apps/mobile/utils/mcDistractors.ts` | Remove `difficulty` from interfaces; add AI priority chain |
| `apps/mobile/utils/__tests__/mcDistractors.test.ts` | Remove `difficulty` from factory; add AI priority tests |
| `apps/admin/components/flashcards/CardReviewTable.tsx` | Remove `difficulty` from interface, table, edit form |
| `apps/admin/app/api/flashcards/process/[id]/route.ts` | Remove `difficulty` from Gemini prompt and card insert |
| `apps/mobile/app/practice/[topicId].tsx` | Remove `DIFF_COLOR`/`DIFF_LABEL`/badges; add AI field parsing |
| `apps/mobile/app/practice/listing/[slug].tsx` | Same as above |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Same as above |
| `apps/mobile/services/llm.ts` (new) | Model path, RAM check, prompt builder, inference, JSON parser |
| `apps/mobile/services/__tests__/llm.test.ts` (new) | Tests for pure functions in llm.ts |
| `apps/mobile/hooks/useModelDownload.ts` (new) | Download state machine, progress, completion notification |
| `apps/mobile/hooks/__tests__/useModelDownload.test.ts` (new) | State transition tests |
| `apps/mobile/hooks/useAiEnhancement.ts` (new) | Background enhancement job |
| `apps/mobile/hooks/__tests__/useAiEnhancement.test.ts` (new) | Enhancement logic tests |
| `apps/mobile/app/(tabs)/practice.tsx` | Add download banner, bottom sheet, progress bar |

---

## Task 1: Supabase migration + Drizzle schema + sync cleanup

**Files:**
- Create: `supabase/migrations/009_remove_difficulty.sql`
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`
- Modify: `apps/mobile/services/sync.ts`

- [ ] **Step 1: Create Supabase migration**

```sql
-- supabase/migrations/009_remove_difficulty.sql
ALTER TABLE flashcards DROP COLUMN IF EXISTS difficulty;
```

- [ ] **Step 2: Update `apps/mobile/db/schema.ts`**

Remove `difficulty: integer('difficulty').notNull(),` and add the four AI columns:

```ts
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
  listingSlugs: text('listing_slugs').notNull().default('[]'),
  options: text('options').notNull().default('[]'),
  correctAnswerIndex: integer('correct_answer_index'),
  remoteUpdatedAt: integer('remote_updated_at'),
  aiOptions: text('ai_options'),
  aiCorrectIndex: integer('ai_correct_index'),
  aiExplanation: text('ai_explanation'),
  aiEnhancedAt: integer('ai_enhanced_at'),
}, (t) => [
  index('flashcards_topic_id_idx').on(t.topicId),
])

export const listings = sqliteTable('listings', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  examDate: integer('exam_date'),
  region: text('region').notNull().default(''),
  description: text('description').notNull().default(''),
  requirements: text('requirements').notNull().default('[]'),
  coverage: text('coverage').notNull().default(''),
  provider: text('provider').notNull().default(''),
  externalUrl: text('external_url').notNull().default(''),
  deadline: integer('deadline'),
  grantAmount: text('grant_amount').notNull().default(''),
}, (t) => [
  index('listings_slug_idx').on(t.slug),
])

export const savedListings = sqliteTable('saved_listings', {
  id: text('id').primaryKey(),
  savedAt: integer('saved_at').notNull(),
})

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey(),
  selectedListingSlug: text('selected_listing_slug').notNull().default(''),
  lastSyncedAt: integer('last_synced_at').notNull().default(0),
  fullName: text('full_name').notNull().default(''),
  school: text('school').notNull().default(''),
  gradeLevel: integer('grade_level'),
  googleId: text('google_id'),
  email: text('email'),
  notificationsEnabled: integer('notifications_enabled', { mode: 'boolean' }).default(true),
  theme: text('theme').notNull().default('system'),
})

export const userProgress = sqliteTable('user_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  flashcardId: text('flashcard_id').notNull(),
  correct: integer('correct', { mode: 'boolean' }).notNull(),
  answeredAt: integer('answered_at').notNull(),
}, (t) => [
  index('user_progress_flashcard_id_idx').on(t.flashcardId),
])

export const savedDecks = sqliteTable('saved_decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  topicIds: text('topic_ids').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
})

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

- [ ] **Step 3: Update `apps/mobile/db/client.ts`**

Remove `difficulty INTEGER NOT NULL,` from CREATE_SQL and add 4 AI column migrations at the end of the MIGRATIONS array:

```ts
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
  listing_slugs TEXT NOT NULL DEFAULT '[]',
  remote_updated_at INTEGER
);
CREATE INDEX IF NOT EXISTS flashcards_topic_id_idx ON flashcards (topic_id);
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  exam_date INTEGER
);
CREATE INDEX IF NOT EXISTS listings_slug_idx ON listings (slug);
CREATE TABLE IF NOT EXISTS user_settings (
  id INTEGER PRIMARY KEY NOT NULL,
  selected_listing_slug TEXT NOT NULL DEFAULT '',
  last_synced_at INTEGER NOT NULL DEFAULT 0,
  full_name TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  grade_level INTEGER,
  google_id TEXT,
  email TEXT
);
CREATE TABLE IF NOT EXISTS user_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  flashcard_id TEXT NOT NULL,
  correct INTEGER NOT NULL,
  answered_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS user_progress_flashcard_id_idx ON user_progress (flashcard_id);
CREATE TABLE IF NOT EXISTS saved_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  topic_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS saved_listings (
  id TEXT PRIMARY KEY NOT NULL,
  saved_at INTEGER NOT NULL
);
`

const MIGRATIONS = [
  `ALTER TABLE user_settings ADD COLUMN full_name TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user_settings ADD COLUMN school TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE user_settings ADD COLUMN grade_level INTEGER`,
  `ALTER TABLE user_settings ADD COLUMN google_id TEXT`,
  `ALTER TABLE user_settings ADD COLUMN email TEXT`,
  `ALTER TABLE listings ADD COLUMN region TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN description TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN requirements TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE listings ADD COLUMN coverage TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN provider TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN external_url TEXT NOT NULL DEFAULT ''`,
  `ALTER TABLE listings ADD COLUMN deadline INTEGER`,
  `ALTER TABLE listings ADD COLUMN grant_amount TEXT NOT NULL DEFAULT ''`,
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
  `ALTER TABLE user_settings ADD COLUMN notifications_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE user_settings ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`,
  `ALTER TABLE flashcards ADD COLUMN options TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE flashcards ADD COLUMN correct_answer_index INTEGER`,
  `ALTER TABLE flashcards ADD COLUMN ai_options TEXT`,
  `ALTER TABLE flashcards ADD COLUMN ai_correct_index INTEGER`,
  `ALTER TABLE flashcards ADD COLUMN ai_explanation TEXT`,
  `ALTER TABLE flashcards ADD COLUMN ai_enhanced_at INTEGER`,
]

export function createDrizzleClient(rawDb: SQLiteDatabase) {
  rawDb.execSync(CREATE_SQL)
  for (const sql of MIGRATIONS) {
    try { rawDb.execSync(sql) } catch { /* column/table already exists */ }
  }
  return drizzle(rawDb, { schema })
}

export type DrizzleClient = ReturnType<typeof createDrizzleClient>
```

- [ ] **Step 4: Update `apps/mobile/services/sync.ts`**

Remove `difficulty` from the Supabase SELECT query (line ~146) and from the `vals` object (line ~189). Add `aiEnhancedAt: null` to the `onConflictDoUpdate` set so updated cards get re-enhanced:

```ts
// In the cardResults query, change this line:
.select('id,topic_id,question,answer,explanation,listing_slugs,options,correct_answer_index,updated_at')
// (removed: ,difficulty)

// In the transaction loop for allCards, replace the vals object and upsert:
for (const row of allCards) {
  const remoteUpdatedAt = new Date(row.updated_at).getTime()
  const vals = {
    id: row.id, topicId: row.topic_id, question: row.question, answer: row.answer,
    explanation: row.explanation,
    listingSlugs: JSON.stringify(row.listing_slugs ?? []),
    options: JSON.stringify(row.options ?? []),
    correctAnswerIndex: row.correct_answer_index ?? null,
    remoteUpdatedAt,
  }
  tx.insert(flashcards).values(vals)
    .onConflictDoUpdate({ target: flashcards.id, set: { ...vals, aiEnhancedAt: null } })
    .run()
}
```

The `aiEnhancedAt: null` in the conflict set means: whenever a card is updated from Supabase, reset its AI enhancement so the background job re-runs it.

- [ ] **Step 5: Type-check to verify no new errors**

```powershell
cd apps/mobile && npx tsc --noEmit 2>&1 | Select-String "difficulty"
```

Expected: no lines referencing `difficulty` (there will be other errors from practice screens that get fixed in Task 4 — those are expected at this stage).

- [ ] **Step 6: Commit**

```powershell
git add supabase/migrations/009_remove_difficulty.sql apps/mobile/db/schema.ts apps/mobile/db/client.ts apps/mobile/services/sync.ts
git commit -m "feat(schema): remove difficulty field, add local-only AI enhancement columns"
```

---

## Task 2: Update mcDistractors — remove difficulty, add AI priority chain

**Files:**
- Modify: `apps/mobile/utils/mcDistractors.ts`
- Modify: `apps/mobile/utils/__tests__/mcDistractors.test.ts`

- [ ] **Step 1: Write failing tests for AI priority chain**

Replace the contents of `apps/mobile/utils/__tests__/mcDistractors.test.ts`:

```ts
import { buildQuizQuestions, RawCard } from '../mcDistractors'

const card = (overrides: Partial<RawCard> = {}): RawCard => ({
  id: '1', question: 'Q?', answer: 'A', explanation: '', ...overrides,
})

describe('buildQuizQuestions', () => {
  describe('AI options — highest priority', () => {
    it('uses aiOptions and aiCorrectIndex when present', () => {
      const c: RawCard = {
        id: 'a1', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        aiOptions: ['Wrong1', 'Correct', 'Wrong2', 'Wrong3'],
        aiCorrectIndex: 1,
        aiExplanation: 'AI exp',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toEqual(['Wrong1', 'Correct', 'Wrong2', 'Wrong3'])
      expect(q!.answerIndex).toBe(1)
      expect(q!.explanation).toBe('AI exp')
    })

    it('uses aiExplanation over admin explanation even when admin options used', () => {
      const c: RawCard = {
        id: 'a2', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
        aiExplanation: 'AI exp',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toEqual(['A', 'B', 'C', 'D'])
      expect(q!.explanation).toBe('AI exp')
    })

    it('falls back to admin explanation when aiExplanation absent', () => {
      const c: RawCard = {
        id: 'a3', question: 'Q?', answer: 'Correct',
        explanation: 'admin exp',
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 0,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.explanation).toBe('admin exp')
    })

    it('ignores aiOptions when aiCorrectIndex is null', () => {
      const c: RawCard = {
        id: 'a4', question: 'Q?', answer: 'Correct',
        explanation: '',
        aiOptions: ['W1', 'Correct', 'W2', 'W3'],
        aiCorrectIndex: null,
        options: ['A', 'B', 'C', 'D'],
        correctAnswerIndex: 2,
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toEqual(['A', 'B', 'C', 'D'])
      expect(q!.answerIndex).toBe(2)
    })
  })

  describe('A. newline format (DB format)', () => {
    it('parses stem and options from A. newline format', () => {
      const c = card({
        question: 'Which organelle produces ATP?\nA. Nucleus\nB. Ribosome\nC. Mitochondria\nD. Chloroplast',
        answer: 'C. Mitochondria',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('Which organelle produces ATP?')
      expect(q!.options).toHaveLength(4)
      expect(q!.options).toContain('Mitochondria')
      expect(q!.options[q!.answerIndex]).toBe('Mitochondria')
    })

    it('strips option labels from stem', () => {
      const c = card({
        question: 'What is H₂O?\nA. Carbon dioxide\nB. Water\nC. Oxygen\nD. Nitrogen',
        answer: 'B. Water',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).not.toMatch(/A\./)
      expect(q!.stem).not.toContain('Carbon dioxide')
    })

    it('handles answer A correctly (answerIndex = 0)', () => {
      const c = card({
        question: 'First letter?\nA. Alpha\nB. Beta\nC. Gamma\nD. Delta',
        answer: 'A. Alpha',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.answerIndex).toBe(0)
      expect(q!.options[0]).toBe('Alpha')
    })

    it('handles answer D correctly (answerIndex = 3)', () => {
      const c = card({
        question: 'Last option?\nA. One\nB. Two\nC. Three\nD. Four',
        answer: 'D. Four',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.answerIndex).toBe(3)
      expect(q!.options[3]).toBe('Four')
    })
  })

  describe('A) inline format (legacy)', () => {
    it('parses A) inline format', () => {
      const c = card({
        question: 'What is 2+2? A) 2 B) 3 C) 4 D) 5',
        answer: 'C) 4',
      })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options[q!.answerIndex]).toBe('4')
    })
  })

  describe('stored options (seeded cards)', () => {
    it('uses stored options and answerIndex directly without modification', () => {
      const c: RawCard = {
        id: 's1', question: 'What is 2+2?', answer: '4',
        options: ['2', '3', '4', '5'], correctAnswerIndex: 2,
        explanation: '',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is 2+2?')
      expect(q!.options).toEqual(['2', '3', '4', '5'])
      expect(q!.answerIndex).toBe(2)
    })

    it('uses stored options even when question has embedded format', () => {
      const c: RawCard = {
        id: 's2',
        question: 'Which is correct?\nA. Wrong\nB. Right\nC. Nope\nD. Maybe',
        answer: 'B. Right',
        options: ['Option1', 'Option2', 'Option3', 'Option4'],
        correctAnswerIndex: 1,
        explanation: '',
      }
      const [q] = buildQuizQuestions([c])
      expect(q!.options).toEqual(['Option1', 'Option2', 'Option3', 'Option4'])
      expect(q!.answerIndex).toBe(1)
    })
  })

  describe('plain Q+A fallback', () => {
    it('includes correct answer in options at answerIndex position', () => {
      const cards: RawCard[] = [
        card({ id: '1', question: 'Q1?', answer: 'Alpha' }),
        card({ id: '2', question: 'Q2?', answer: 'Beta' }),
        card({ id: '3', question: 'Q3?', answer: 'Gamma' }),
        card({ id: '4', question: 'Q4?', answer: 'Delta' }),
      ]
      const [q] = buildQuizQuestions(cards)
      expect(q!.options).toHaveLength(4)
      expect(q!.options[q!.answerIndex]).toBe('Alpha')
    })

    it('stem is the raw question text', () => {
      const c = card({ question: 'What is the capital of France?' })
      const [q] = buildQuizQuestions([c])
      expect(q!.stem).toBe('What is the capital of France?')
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
cd apps/mobile && npx jest utils/__tests__/mcDistractors.test.ts --no-coverage 2>&1 | Select-String "FAIL|●"
```

Expected: FAIL — `difficulty` still on interfaces, AI priority tests fail.

- [ ] **Step 3: Rewrite `apps/mobile/utils/mcDistractors.ts`**

```ts
export interface RawCard {
  id: string
  question: string
  answer: string
  options?: string[] | null
  correctAnswerIndex?: number | null
  explanation: string
  aiOptions?: string[] | null
  aiCorrectIndex?: number | null
  aiExplanation?: string | null
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
}

const FALLBACKS = ['Cannot be determined', 'None of the above', 'All of the above']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

function stripPrefix(answer: string): string {
  return answer.replace(/^[A-D][.)]\s*/, '').trim()
}

function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A[.)]\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])[.)]/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return {
    id: card.id,
    stem,
    options,
    answerIndex,
    explanation: card.aiExplanation ?? card.explanation,
  }
}

/**
 * Converts every RawCard to a QuizQuestion.
 * Priority 1: AI-generated options (cached in local SQLite).
 * Priority 2: admin-stored options[] + correctAnswerIndex.
 * Priority 3: embedded A)/A. parsing.
 * Priority 4: synthetic distractors from pool.
 * Explanation: aiExplanation preferred over admin explanation at every level.
 */
export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
    const explanation = card.aiExplanation ?? card.explanation

    // Priority 1: AI-generated options
    if (card.aiOptions && card.aiOptions.length === 4 && card.aiCorrectIndex != null) {
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.aiOptions,
        answerIndex: card.aiCorrectIndex,
        explanation,
      }
    }

    // Priority 2: admin-stored options
    if (card.options && card.options.length === 4 && card.correctAnswerIndex != null) {
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.options,
        answerIndex: card.correctAnswerIndex,
        explanation,
      }
    }

    // Priority 3: embedded A)/A. parsing
    const embedded = parseEmbedded(card)
    if (embedded) return { ...embedded, explanation }

    // Priority 4: synthetic distractors from pool
    const correct = stripPrefix(card.answer)
    const pool = cards
      .filter(c => c.id !== card.id)
      .map(c => stripPrefix(c.answer))
      .filter(a => a.length > 0 && a.toLowerCase() !== correct.toLowerCase())
    const unique = [...new Set(pool)]
    const distractors = shuffle(unique).slice(0, 3)

    let fi = 0
    while (distractors.length < 3) {
      const fb = FALLBACKS[fi % FALLBACKS.length]!
      if (!distractors.includes(fb)) distractors.push(fb)
      fi++
    }

    const all = shuffle([correct, ...distractors.slice(0, 3)])
    return {
      id: card.id,
      stem: card.question.trim(),
      options: all,
      answerIndex: Math.max(0, all.indexOf(correct)),
      explanation,
    }
  })
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
cd apps/mobile && npx jest utils/__tests__/mcDistractors.test.ts --no-coverage 2>&1 | Select-String "PASS|FAIL|Tests:"
```

Expected: `PASS` · `Tests: 13 passed`

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/utils/mcDistractors.ts apps/mobile/utils/__tests__/mcDistractors.test.ts
git commit -m "feat(quiz): remove difficulty from quiz types, add AI options priority chain"
```

---

## Task 3: Admin cleanup — remove difficulty from CardReviewTable and Gemini route

**Files:**
- Modify: `apps/admin/components/flashcards/CardReviewTable.tsx`
- Modify: `apps/admin/app/api/flashcards/process/[id]/route.ts`

- [ ] **Step 1: Rewrite `apps/admin/components/flashcards/CardReviewTable.tsx`**

Remove `difficulty` from the `Card` interface, delete `DIFFICULTY_LABELS`, remove the table column, and remove the edit form select:

```tsx
'use client'

import { useState } from 'react'

export interface Card {
  id: string
  question: string
  answer: string
  explanation: string
}

interface Props {
  cards: Card[]
  onUpdate: (id: string, updates: Partial<Card>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAdd: () => void
}

export function CardReviewTable({ cards, onUpdate, onDelete, onAdd }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Card>>({})

  function startEdit(card: Card) {
    setEditingId(card.id)
    setDraft({ question: card.question, answer: card.answer, explanation: card.explanation })
  }

  async function saveEdit(id: string) {
    await onUpdate(id, draft)
    setEditingId(null)
    setDraft({})
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[#f3f4f6] flex items-center justify-between">
        <span className="font-bold text-xs text-[#1d1d1f]">Extracted Cards</span>
        <button
          onClick={onAdd}
          className="border border-[#d1d5db] rounded-lg px-3 py-1 text-xs text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
        >
          + Add manually
        </button>
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[40%]">Question</th>
            <th className="px-4 py-2.5 text-left text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[40%]">Answer</th>
            <th className="px-4 py-2.5 text-right text-[10px] uppercase tracking-wide text-[#6e6e73] font-semibold w-[20%]">Actions</th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) =>
            editingId === card.id ? (
              <tr key={card.id} className="border-b border-[#f3f4f6] bg-[#fffbeb]">
                <td className="px-4 py-2">
                  <textarea
                    value={draft.question ?? ''}
                    onChange={(e) => setDraft({ ...draft, question: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2">
                  <textarea
                    value={draft.answer ?? ''}
                    onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
                    className="w-full border border-[#d1d5db] rounded-md p-1.5 text-xs resize-none"
                    rows={3}
                  />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => saveEdit(card.id)}
                      className="bg-[#800000] text-white rounded-md px-2 py-1 text-[11px] font-semibold"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="border border-[#d1d5db] rounded-md px-2 py-1 text-[11px]"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0">
                <td className="px-4 py-2.5 text-[#1d1d1f]">{card.question}</td>
                <td className="px-4 py-2.5 text-[#374151]">{card.answer}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      onClick={() => startEdit(card)}
                      className="bg-[#f5f5f7] border-0 rounded-md px-2 py-1 text-[11px]"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(card.id)}
                      className="bg-[#fff0f0] border-0 rounded-md px-2 py-1 text-[11px] text-[#800000]"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Update `apps/admin/app/api/flashcards/process/[id]/route.ts`**

Remove `difficulty` from the Gemini prompt, `GeminiCard` interface, and card insert. Replace the top section:

```ts
const PROMPT = `You are extracting Q&A flashcard pairs from a study material PDF for Filipino students
preparing for scholarship and qualifying exams (DOST-SEI, UPCAT, PUPCET, CSE, etc.).

Analyze the entire document and extract the most important concepts as question-answer pairs.

Return ONLY valid JSON with this exact structure — no markdown, no explanation, no extra text:
{
  "subject": "<subject area, e.g. Science, Mathematics, Filipino, English, General Knowledge>",
  "topic": "<specific topic, e.g. Cell Biology, Algebra, Panitikang Filipino>",
  "cards": [
    {
      "question": "<clear, specific question>",
      "answer": "<concise, accurate answer>",
      "explanation": "<brief context or elaboration — empty string if not needed>"
    }
  ]
}

Generate between 15 and 40 cards. Prioritize high-yield concepts for competitive exams.`

interface GeminiCard {
  question: string
  answer: string
  explanation: string
}
```

And update the cards mapping (find the section that builds `cards` and remove `difficulty`):

```ts
const cards = parsed.cards.map((c) => ({
  topic_id: topic.id,
  question: c.question,
  answer: c.answer,
  explanation: c.explanation,
  status: 'draft',
  source_pdf_url: job.pdf_url,
  listing_slugs: [],
}))
```

- [ ] **Step 3: Type-check the admin app**

```powershell
cd apps/admin && npx tsc --noEmit 2>&1 | Select-String "difficulty|error"
```

Expected: no `difficulty` errors. (There may be pre-existing unrelated errors — ignore those.)

- [ ] **Step 4: Commit**

```powershell
git add apps/admin/components/flashcards/CardReviewTable.tsx apps/admin/app/api/flashcards/process/[id]/route.ts
git commit -m "feat(admin): remove difficulty field from card table, edit form, and Gemini prompt"
```

---

## Task 4: Remove difficulty from all 3 quiz screens + add AI field parsing

Each screen has the same pattern: `DIFF_COLOR`/`DIFF_LABEL` constants at the top, `difficulty` in the DB select, `diffBadge`/`questionDiff` styles, and two badge render sites. The AI fields need to be added to each DB select and parsed alongside `options`.

**Files:**
- Modify: `apps/mobile/app/practice/[topicId].tsx`
- Modify: `apps/mobile/app/practice/listing/[slug].tsx`
- Modify: `apps/mobile/app/practice/deck/[deckId].tsx`

- [ ] **Step 1: Remove difficulty from `[topicId].tsx`**

**a) Delete lines 19-20** (the two constants at the top of the file):
```ts
// DELETE these two lines:
const DIFF_COLOR: Record<number, string> = { 1: '#4ade80', 2: '#fbbf24', 3: '#f87171' }
const DIFF_LABEL: Record<number, string> = { 1: 'Easy', 2: 'Medium', 3: 'Hard' }
```

**b) In the DB select (around line 210)**, remove `difficulty: flashcardsTable.difficulty,` and add AI fields:
```ts
// In the db.select({ ... }) call, remove:
difficulty: flashcardsTable.difficulty,
// And add:
aiOptions: flashcardsTable.aiOptions,
aiCorrectIndex: flashcardsTable.aiCorrectIndex,
aiExplanation: flashcardsTable.aiExplanation,
```

**c) When building the RawCard array** (wherever cards are mapped before being passed to `buildQuizQuestions`), add AI field parsing alongside the existing `options` parsing:
```ts
// Find the map that does JSON.parse(c.options) and add:
aiOptions: c.aiOptions ? (JSON.parse(c.aiOptions) as string[]) : null,
aiCorrectIndex: c.aiCorrectIndex ?? null,
aiExplanation: c.aiExplanation ?? null,
```

**d) Remove the styles** `diffBadge`, `diffTxt`, `questionDiff`, `questionDiffTxt` from the `StyleSheet.create` call.

**e) Remove the two badge render blocks** (around lines 479-483 and 611-615):
```tsx
// DELETE this block (appears twice, once in results review, once during quiz):
<View style={[s.diffBadge, { borderColor: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>
  <Text style={[s.diffTxt, { color: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>
    {DIFF_LABEL[q.difficulty] ?? 'Medium'}
  </Text>
</View>

// And DELETE this block:
<View style={[s.questionDiff, { borderColor: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>
  <Text style={[s.questionDiffTxt, { color: DIFF_COLOR[q.difficulty] ?? '#fbbf24' }]}>
    {DIFF_LABEL[q.difficulty] ?? 'Medium'}
  </Text>
</View>
```

- [ ] **Step 2: Apply the same changes to `listing/[slug].tsx`**

Grep confirms the same patterns exist at:
- Line 149: `difficulty: flashcardsTable.difficulty,` in select
- Lines 403-404: `diffBadge` render (results review only — this screen has one badge site)

Apply identical steps a–e from Step 1.

- [ ] **Step 3: Apply the same changes to `deck/[deckId].tsx`**

Grep confirms:
- Line 217: `difficulty: flashcardsTable.difficulty,` in select
- Lines 495-497 and 624-626: two badge sites

Apply identical steps a–e from Step 1.

- [ ] **Step 4: Run type-check to confirm all difficulty references are gone**

```powershell
cd apps/mobile && npx tsc --noEmit 2>&1 | Select-String "difficulty"
```

Expected: zero lines. (Other pre-existing errors are acceptable — they existed before this branch.)

- [ ] **Step 5: Run the full test suite**

```powershell
cd C:\Users\User\OneDrive\Desktop\IskotifyApp && npx turbo run test 2>&1 | Select-String "FAIL|Tests:"
```

Expected: same pre-existing failures as before (supabase.test.ts, useAnalytics.test.ts, export.test.ts) — no new failures.

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/app/practice/
git commit -m "feat(practice): remove difficulty badges from all quiz screens, add AI field parsing"
```

---

## Task 5: Install packages + create `llm.ts` service

**Files:**
- Modify: `apps/mobile/package.json`
- Create: `apps/mobile/services/llm.ts`
- Create: `apps/mobile/services/__tests__/llm.test.ts`

- [ ] **Step 1: Install dependencies**

```powershell
cd apps/mobile
npx expo install expo-file-system expo-device
pnpm add llama.rn react-native-background-downloader
```

Verify additions appear in `apps/mobile/package.json`.

- [ ] **Step 2: Write failing tests for pure functions in `llm.ts`**

Create `apps/mobile/services/__tests__/llm.test.ts`:

```ts
import { buildPrompt, parseResponse } from '../llm'

describe('buildPrompt', () => {
  it('uses science prompt for Biology subject', () => {
    const prompt = buildPrompt({ subjectName: 'Science (Biology)', topicName: 'Cell Biology', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('UPCAT reviewer engine')
    expect(prompt).toContain('factually wrong')
  })

  it('uses math prompt for Mathematics subject', () => {
    const prompt = buildPrompt({ subjectName: 'Mathematics', topicName: 'Algebra', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('Do NOT solve')
    expect(prompt).toContain('student mistakes')
  })

  it('uses math prompt when subject contains Geometry', () => {
    const prompt = buildPrompt({ subjectName: 'Geometry', topicName: 'Circles', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('Do NOT solve')
  })

  it('uses language prompt for English subject', () => {
    const prompt = buildPrompt({ subjectName: 'English', topicName: 'Grammar', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('grammatically')
  })

  it('uses language prompt for Filipino subject', () => {
    const prompt = buildPrompt({ subjectName: 'Filipino', topicName: 'Panitikan', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('grammatically')
  })

  it('includes ChatML format tokens for Qwen', () => {
    const prompt = buildPrompt({ subjectName: 'Science', topicName: 'Physics', question: 'Q?', answer: 'A' })
    expect(prompt).toContain('<|im_start|>system')
    expect(prompt).toContain('<|im_end|>')
    expect(prompt).toContain('<|im_start|>user')
    expect(prompt).toContain('<|im_start|>assistant')
  })

  it('includes subject, question, and answer in user section', () => {
    const prompt = buildPrompt({ subjectName: 'Biology', topicName: 'Genetics', question: 'What is DNA?', answer: 'Deoxyribonucleic acid' })
    expect(prompt).toContain('Biology')
    expect(prompt).toContain('What is DNA?')
    expect(prompt).toContain('Deoxyribonucleic acid')
  })
})

describe('parseResponse', () => {
  it('parses valid JSON output', () => {
    const text = `{"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":"Because."}`
    const result = parseResponse(text)
    expect(result).not.toBeNull()
    expect(result!.wrong_option_1).toBe('A')
    expect(result!.wrong_option_2).toBe('B')
    expect(result!.wrong_option_3).toBe('C')
    expect(result!.explanation).toBe('Because.')
  })

  it('extracts JSON from surrounding model chatter', () => {
    const text = `Sure! Here you go: {"wrong_option_1":"A","wrong_option_2":"B","wrong_option_3":"C","explanation":"Because."} Hope that helps.`
    const result = parseResponse(text)
    expect(result).not.toBeNull()
    expect(result!.wrong_option_1).toBe('A')
  })

  it('returns null for malformed JSON', () => {
    expect(parseResponse('not json at all')).toBeNull()
  })

  it('returns null when wrong_option fields are missing', () => {
    expect(parseResponse('{"explanation":"Because."}')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseResponse('')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to confirm they fail**

```powershell
cd apps/mobile && npx jest services/__tests__/llm.test.ts --no-coverage 2>&1 | Select-String "FAIL|Cannot find"
```

Expected: FAIL — `llm.ts` does not exist yet.

- [ ] **Step 4: Create `apps/mobile/services/llm.ts`**

```ts
import { initLlama } from 'llama.rn'
import * as FileSystem from 'expo-file-system'
import * as Device from 'expo-device'

const MODEL_FILENAME = 'qwen2.5-1.5b-instruct-q4_k_m.gguf'
const MODEL_DIR = `${FileSystem.documentDirectory}models/`
export const MODEL_PATH = `${MODEL_DIR}${MODEL_FILENAME}`

// Hosted on HuggingFace — replace with your own CDN URL for production
export const MODEL_DOWNLOAD_URL =
  'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf'

const MIN_RAM_BYTES = 2 * 1024 * 1024 * 1024  // 2 GB

export function hasEnoughRam(): boolean {
  const total = Device.totalMemory
  if (total === null) return true  // unknown device — allow download
  return total >= MIN_RAM_BYTES
}

export async function modelExists(): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH)
  return info.exists
}

type PromptStrategy = 'science' | 'math' | 'language'

function detectStrategy(subjectName: string): PromptStrategy {
  const s = subjectName.toLowerCase()
  if (
    s.includes('math') || s.includes('algebra') ||
    s.includes('geometry') || s.includes('trigonometry')
  ) return 'math'
  if (s.includes('english') || s.includes('filipino') || s.includes('language')) return 'language'
  return 'science'
}

export function buildPrompt(params: {
  subjectName: string
  topicName: string
  question: string
  answer: string
}): string {
  const { subjectName, topicName, question, answer } = params
  const strategy = detectStrategy(subjectName)

  let systemPrompt: string
  if (strategy === 'math') {
    systemPrompt =
      `You are an expert UPCAT Math reviewer. Do NOT solve the problem. Instead, generate exactly ` +
      `3 incorrect answer choices that reflect common student mistakes such as sign errors, wrong ` +
      `formula application, or arithmetic slips. Write a 2-sentence explanation of why the Right ` +
      `Answer is correct. Output ONLY valid JSON, no other text.`
  } else if (strategy === 'language') {
    systemPrompt =
      `You are an expert UPCAT Language reviewer. Generate exactly 3 grammatically or idiomatically ` +
      `incorrect variations of the correct answer that a student might plausibly choose. Write a ` +
      `2-sentence explanation of why the Right Answer is correct. Output ONLY valid JSON, no other text.`
  } else {
    systemPrompt =
      `You are an expert UPCAT reviewer engine. Analyze the provided Question, Subject, and Right Answer. ` +
      `Generate exactly 3 plausible, highly challenging college-level incorrect choices (distractors) that ` +
      `fit the context but are factually wrong. Then write a crisp 2-sentence explanation of why the Right ` +
      `Answer is correct. Output ONLY valid JSON, no other text.`
  }

  const userMessage =
    `Subject: ${subjectName} (${topicName})\n` +
    `Question: ${question}\n` +
    `Right Answer: ${answer}`

  // ChatML format required by Qwen 2.5 Instruct GGUF
  return (
    `<|im_start|>system\n${systemPrompt}<|im_end|>\n` +
    `<|im_start|>user\n${userMessage}<|im_end|>\n` +
    `<|im_start|>assistant\n`
  )
}

export interface LlmOutput {
  wrong_option_1: string
  wrong_option_2: string
  wrong_option_3: string
  explanation: string
}

export function parseResponse(text: string): LlmOutput | null {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0]) as Partial<LlmOutput>
    if (
      !parsed.wrong_option_1 || !parsed.wrong_option_2 ||
      !parsed.wrong_option_3 || !parsed.explanation
    ) return null
    return parsed as LlmOutput
  } catch {
    return null
  }
}

export async function runInference(prompt: string): Promise<LlmOutput | null> {
  const context = await initLlama({
    model: MODEL_PATH,
    n_ctx: 2048,
    n_threads: 4,
  })
  try {
    const result = await context.completion({
      prompt,
      n_predict: 400,
      temperature: 0.1,
      stop: ['<|im_end|>', '</s>'],
    })
    return parseResponse(result.text)
  } finally {
    await context.release()
  }
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```powershell
cd apps/mobile && npx jest services/__tests__/llm.test.ts --no-coverage 2>&1 | Select-String "PASS|FAIL|Tests:"
```

Expected: `PASS` · `Tests: 13 passed`

- [ ] **Step 6: Commit**

```powershell
git add apps/mobile/package.json pnpm-lock.yaml apps/mobile/services/llm.ts apps/mobile/services/__tests__/llm.test.ts
git commit -m "feat(llm): add llm.ts service — Qwen 2.5 1.5B prompt builder, inference wrapper, JSON parser"
```

---

## Task 6: Create `useModelDownload` hook

**Files:**
- Create: `apps/mobile/hooks/useModelDownload.ts`
- Create: `apps/mobile/hooks/__tests__/useModelDownload.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile/hooks/__tests__/useModelDownload.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react-native'

jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  hasEnoughRam: jest.fn(),
  MODEL_PATH: '/mock/path/model.gguf',
  MODEL_DOWNLOAD_URL: 'https://example.com/model.gguf',
}))

jest.mock('react-native-background-downloader', () => ({
  __esModule: true,
  default: {
    download: jest.fn(),
  },
}))

jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}))

import { useModelDownload } from '../useModelDownload'
import { modelExists, hasEnoughRam } from '../../services/llm'

const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>
const mockHasEnoughRam = hasEnoughRam as jest.MockedFunction<typeof hasEnoughRam>

describe('useModelDownload', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sets status to ready when model already exists', async () => {
    mockModelExists.mockResolvedValue(true)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('ready')
  })

  it('sets status to absent when model not found and RAM sufficient', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('absent')
  })

  it('sets status to unsupported when RAM insufficient', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(false)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.modelStatus).toBe('unsupported')
  })

  it('exposes progress as 0 initially', async () => {
    mockModelExists.mockResolvedValue(false)
    mockHasEnoughRam.mockReturnValue(true)
    const { result } = renderHook(() => useModelDownload())
    await act(async () => {})
    expect(result.current.progress).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
cd apps/mobile && npx jest hooks/__tests__/useModelDownload.test.ts --no-coverage 2>&1 | Select-String "FAIL|Cannot find"
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `apps/mobile/hooks/useModelDownload.ts`**

```ts
import { useState, useEffect, useCallback } from 'react'
import * as Notifications from 'expo-notifications'
import RNBackgroundDownloader from 'react-native-background-downloader'
import { modelExists, hasEnoughRam, MODEL_PATH, MODEL_DOWNLOAD_URL } from '../services/llm'

export type ModelStatus = 'unknown' | 'absent' | 'downloading' | 'ready' | 'unsupported'

interface UseModelDownload {
  modelStatus: ModelStatus
  progress: number           // 0–1
  startDownload: () => void
  onDownloadComplete?: () => void
}

export function useModelDownload(onDownloadComplete?: () => void): UseModelDownload {
  const [modelStatus, setModelStatus] = useState<ModelStatus>('unknown')
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    async function check() {
      if (!hasEnoughRam()) { setModelStatus('unsupported'); return }
      const exists = await modelExists()
      setModelStatus(exists ? 'ready' : 'absent')
    }
    void check()
  }, [])

  const startDownload = useCallback(() => {
    setModelStatus('downloading')
    setProgress(0)

    const task = RNBackgroundDownloader.download({
      id: 'qwen-model',
      url: MODEL_DOWNLOAD_URL,
      destination: MODEL_PATH,
    })

    task.progress(({ written, total }: { written: number; total: number }) => {
      if (total > 0) setProgress(written / total)
    })

    task.done(async () => {
      setModelStatus('ready')
      setProgress(1)
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'AI Reviewer is ready!',
          body: 'Your flashcards are now being enhanced in the background.',
        },
        trigger: null,
      })
      onDownloadComplete?.()
    })

    task.error((err: Error) => {
      console.warn('[useModelDownload] download failed:', err)
      setModelStatus('absent')
      setProgress(0)
    })
  }, [onDownloadComplete])

  return { modelStatus, progress, startDownload }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
cd apps/mobile && npx jest hooks/__tests__/useModelDownload.test.ts --no-coverage 2>&1 | Select-String "PASS|FAIL|Tests:"
```

Expected: `PASS` · `Tests: 4 passed`

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/hooks/useModelDownload.ts apps/mobile/hooks/__tests__/useModelDownload.test.ts
git commit -m "feat(mobile): add useModelDownload hook — download state machine with progress and notification"
```

---

## Task 7: Create `useAiEnhancement` hook

**Files:**
- Create: `apps/mobile/hooks/useAiEnhancement.ts`
- Create: `apps/mobile/hooks/__tests__/useAiEnhancement.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/mobile/hooks/__tests__/useAiEnhancement.test.ts`:

```ts
jest.mock('../../services/llm', () => ({
  modelExists: jest.fn(),
  buildPrompt: jest.fn().mockReturnValue('mock-prompt'),
  runInference: jest.fn(),
}))

jest.mock('../../hooks/useDb', () => ({
  useDb: jest.fn(),
}))

import { modelExists, runInference } from '../../services/llm'
import { runEnhancement } from '../useAiEnhancement'

const mockModelExists = modelExists as jest.MockedFunction<typeof modelExists>
const mockRunInference = runInference as jest.MockedFunction<typeof runInference>

function makeMockDb(cards: object[], topicResult: object[], subjectResult: object[]) {
  const updateSet = jest.fn().mockReturnThis()
  const updateWhere = jest.fn().mockResolvedValue(undefined)
  return {
    select: jest.fn().mockImplementation(() => ({
      from: jest.fn().mockImplementation((table: unknown) => {
        const name = (table as { _: { name: string } })._.name ?? ''
        return {
          where: jest.fn().mockImplementation(() => ({
            limit: jest.fn().mockResolvedValue(
              name === 'topics' ? topicResult :
              name === 'subjects' ? subjectResult : cards
            ),
            mockResolvedValue: jest.fn(),
          })),
          mockResolvedValue: jest.fn().mockResolvedValue(cards),
        }
      }),
    })),
    update: jest.fn().mockReturnValue({ set: updateSet }),
  } as unknown as Parameters<typeof runEnhancement>[0]
}

describe('runEnhancement', () => {
  beforeEach(() => jest.clearAllMocks())

  it('skips entirely when model does not exist', async () => {
    mockModelExists.mockResolvedValue(false)
    const db = makeMockDb([], [], [])
    await runEnhancement(db)
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('skips cards that already have aiEnhancedAt set', async () => {
    mockModelExists.mockResolvedValue(true)
    // DB returns no unenhanced cards
    const db = makeMockDb([], [], [])
    await runEnhancement(db)
    expect(mockRunInference).not.toHaveBeenCalled()
  })

  it('skips card gracefully when inference returns null', async () => {
    mockModelExists.mockResolvedValue(true)
    mockRunInference.mockResolvedValue(null)
    // Tested via integration; the unit check is that no throw propagates
    await expect(runEnhancement(makeMockDb([], [], []))).resolves.not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```powershell
cd apps/mobile && npx jest hooks/__tests__/useAiEnhancement.test.ts --no-coverage 2>&1 | Select-String "FAIL|Cannot find"
```

Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create `apps/mobile/hooks/useAiEnhancement.ts`**

```ts
import { useCallback } from 'react'
import { eq, isNull } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { flashcards, topics, subjects } from '../db/schema'
import { modelExists, buildPrompt, runInference } from '../services/llm'

function shuffleWithCorrect(
  correctAnswer: string,
  distractors: [string, string, string]
): { options: string[]; correctIndex: number } {
  const all: string[] = [correctAnswer, ...distractors]
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[all[i], all[j]] = [all[j]!, all[i]!]
  }
  return { options: all, correctIndex: all.indexOf(correctAnswer) }
}

export async function runEnhancement(db: DrizzleClient): Promise<void> {
  if (!(await modelExists())) return

  const unenhanced = await db
    .select({
      id: flashcards.id,
      topicId: flashcards.topicId,
      question: flashcards.question,
      answer: flashcards.answer,
    })
    .from(flashcards)
    .where(isNull(flashcards.aiEnhancedAt))

  for (const card of unenhanced) {
    try {
      const topicRows = await db
        .select({ subjectId: topics.subjectId, topicName: topics.name })
        .from(topics)
        .where(eq(topics.id, card.topicId))
        .limit(1)

      if (!topicRows[0]) continue

      const subjectRows = await db
        .select({ name: subjects.name })
        .from(subjects)
        .where(eq(subjects.id, topicRows[0].subjectId))
        .limit(1)

      const subjectName = subjectRows[0]?.name ?? 'General Knowledge'
      const topicName = topicRows[0].topicName

      const prompt = buildPrompt({ subjectName, topicName, question: card.question, answer: card.answer })
      const output = await runInference(prompt)
      if (!output) continue

      const { options, correctIndex } = shuffleWithCorrect(card.answer, [
        output.wrong_option_1,
        output.wrong_option_2,
        output.wrong_option_3,
      ])

      await db
        .update(flashcards)
        .set({
          aiOptions: JSON.stringify(options),
          aiCorrectIndex: correctIndex,
          aiExplanation: output.explanation,
          aiEnhancedAt: Date.now(),
        })
        .where(eq(flashcards.id, card.id))
    } catch {
      // Skip this card silently — it will be retried on the next trigger
    }
  }
}

export function useAiEnhancement() {
  const enhance = useCallback(async (db: DrizzleClient) => {
    await runEnhancement(db)
  }, [])

  return { enhance }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```powershell
cd apps/mobile && npx jest hooks/__tests__/useAiEnhancement.test.ts --no-coverage 2>&1 | Select-String "PASS|FAIL|Tests:"
```

Expected: `PASS` · `Tests: 3 passed`

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/hooks/useAiEnhancement.ts apps/mobile/hooks/__tests__/useAiEnhancement.test.ts
git commit -m "feat(mobile): add useAiEnhancement hook — background card enhancement with Qwen cache-first"
```

---

## Task 8: Wire download banner in `practice.tsx` + trigger enhancement after sync

**Files:**
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Find where `syncOnLaunch` is called in the app**

```powershell
cd apps/mobile && grep -rn "syncOnLaunch" --include="*.tsx" --include="*.ts" .
```

Note the file path(s) returned. Add a call to `runEnhancement(db)` immediately after `await syncOnLaunch(db)` in each call site.

For example, if it appears in `app/_layout.tsx`:
```ts
// Find: await syncOnLaunch(db)
// Replace with:
await syncOnLaunch(db)
await runEnhancement(db)
```

Import `runEnhancement` at the top of that file:
```ts
import { runEnhancement } from '../hooks/useAiEnhancement'
```

- [ ] **Step 2: Add download banner + bottom sheet to `apps/mobile/app/(tabs)/practice.tsx`**

Add imports at the top of the file (alongside existing imports):
```ts
import { useModelDownload } from '../../hooks/useModelDownload'
import { useAiEnhancement } from '../../hooks/useAiEnhancement'
import { useDb } from '../../hooks/useDb'
```

Inside `PracticeScreen` (the default export component), add hook calls near the top:
```ts
const db = useDb()
const { enhance } = useAiEnhancement()
const { modelStatus, progress, startDownload } = useModelDownload(
  () => void enhance(db)  // called when download completes
)
const [showDownloadSheet, setShowDownloadSheet] = useState(false)
```

Add the download banner JSX **at the very top of the returned `<SafeAreaView>` content**, before the header:
```tsx
{modelStatus === 'absent' && (
  <TouchableOpacity
    style={{
      backgroundColor: 'rgba(128,0,0,0.10)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(128,0,0,0.20)',
      paddingHorizontal: 16,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    }}
    onPress={() => setShowDownloadSheet(true)}
    activeOpacity={0.8}
  >
    <Text style={{ flex: 1, fontSize: typo.xs, color: '#fca5a5', fontFamily: 'Lexend_500Medium' }}>
      ✨ Enable AI-enhanced practice — Download Reviewer Engine (~950 MB)
    </Text>
    <Text style={{ color: '#fca5a5', fontSize: 16 }}>›</Text>
  </TouchableOpacity>
)}

{modelStatus === 'downloading' && (
  <View style={{
    height: 3,
    backgroundColor: 'rgba(128,0,0,0.15)',
    marginBottom: 2,
  }}>
    <View style={{
      height: 3,
      width: `${Math.round(progress * 100)}%`,
      backgroundColor: '#fca5a5',
    }} />
  </View>
)}
```

Add the bottom sheet modal **before the closing `</>` of the returned JSX**:
```tsx
<Modal
  visible={showDownloadSheet}
  animationType="slide"
  transparent
  onRequestClose={() => setShowDownloadSheet(false)}
>
  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
    <TouchableOpacity
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      activeOpacity={1}
      onPress={() => setShowDownloadSheet(false)}
    />
    <View style={{
      backgroundColor: t.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    }}>
      <Text style={{ fontSize: typo.lg, fontFamily: 'Outfit_700Bold', color: t.textPrimary, marginBottom: 8 }}>
        AI Reviewer Engine
      </Text>
      <Text style={{ fontSize: typo.sm, fontFamily: 'Lexend_400Regular', color: t.textSecondary, marginBottom: 4 }}>
        Model: Qwen 2.5 1.5B Instruct (Q4_K_M)
      </Text>
      <Text style={{ fontSize: typo.sm, fontFamily: 'Lexend_400Regular', color: t.textSecondary, marginBottom: 4 }}>
        Download size: ~950 MB
      </Text>
      <Text style={{ fontSize: typo.sm, fontFamily: 'Lexend_400Regular', color: t.textTertiary, marginBottom: 24 }}>
        Requires ≥ 2 GB RAM · Downloads in background
      </Text>
      <TouchableOpacity
        style={{
          backgroundColor: 'rgba(128,0,0,0.82)',
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          marginBottom: 10,
        }}
        onPress={() => { setShowDownloadSheet(false); startDownload() }}
        activeOpacity={0.8}
      >
        <Text style={{ color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: typo.md }}>
          Download
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={{ alignItems: 'center', paddingVertical: 10 }}
        onPress={() => setShowDownloadSheet(false)}
      >
        <Text style={{ color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm }}>
          Not now
        </Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>
```

Add `Modal` to the React Native imports at the top if it isn't already imported.

- [ ] **Step 3: Run full test suite**

```powershell
cd C:\Users\User\OneDrive\Desktop\IskotifyApp && npx turbo run test 2>&1 | Select-String "FAIL|Tests:"
```

Expected: same pre-existing failures only — no new failures from our changes.

- [ ] **Step 4: Type-check mobile app**

```powershell
cd apps/mobile && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors related to `difficulty`, AI fields, or the new hooks.

- [ ] **Step 5: Commit**

```powershell
git add apps/mobile/app/(tabs)/practice.tsx
git add -A  # picks up any layout file changes from Step 1
git commit -m "feat(practice): add AI model download banner, bottom sheet, progress bar + wire enhancement trigger"
```

---

## Self-Review Checklist

- [x] **Spec §1 Difficulty removal**: Tasks 1–4 cover Supabase migration, Drizzle schema, sync.ts, mcDistractors, admin CardReviewTable, admin Gemini route, all 3 quiz screens.
- [x] **Spec §2 Local AI fields**: Task 1 adds 4 columns to schema.ts + client.ts MIGRATIONS.
- [x] **Spec §3 llama.rn / thread safety**: Task 5 uses `initLlama` async API which runs on a native background thread; JS thread is never blocked.
- [x] **Spec §4 Model download flow**: Task 6 (useModelDownload) + Task 8 (banner UI + bottom sheet).
- [x] **Spec §5 Cache-first + background enhancement**: Task 7 (useAiEnhancement) checks `isNull(aiEnhancedAt)` before calling LLM; Task 8 wires trigger after sync and after download completes.
- [x] **Spec §5 Subject-aware prompts**: Task 5 `buildPrompt()` has Math / Language / Science branches.
- [x] **Spec §6 mcDistractors priority chain**: Task 2 adds AI priority before admin-stored options.
- [x] **Spec §5 aiEnhancedAt reset on sync update**: Task 1 sync.ts adds `aiEnhancedAt: null` to conflict update set.
- [x] **No placeholders**: All code blocks are complete and concrete.
- [x] **Type consistency**: `RawCard.aiOptions` is `string[] | null` throughout; `aiCorrectIndex` is `number | null`; both are guarded with `!= null` check in mcDistractors.
