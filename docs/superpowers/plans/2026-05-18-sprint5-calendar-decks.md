# Sprint 5 — Calendar Strip & Saved Decks

> **Goal:** Give the Home screen a live 7-day activity calendar and give the Practice Hub a Saved Decks feature so students can build custom multi-topic study sessions.

**Architecture:** No new external libraries. Calendar strip is pure React Native. Saved Decks use a new `saved_decks` SQLite table via Drizzle. Deck flashcard sessions reuse the existing flashcard engine pattern.

**Tech Stack:** expo-sqlite · Drizzle ORM · React Native Modal · existing design tokens (`#1a1a2e`, Outfit/Lexend fonts, `rgba` glass cards)

---

## File Map

| File | Action |
|---|---|
| `apps/mobile/db/schema.ts` | Modify — add `savedDecks` table |
| `apps/mobile/db/client.ts` | Modify — add `CREATE TABLE IF NOT EXISTS saved_decks` |
| `apps/mobile/hooks/useHomeStats.ts` | Modify — add `calendarDays` field + `computeCalendarDays` pure fn |
| `apps/mobile/hooks/useSavedDecks.ts` | Create — CRUD hook for saved decks |
| `apps/mobile/hooks/__tests__/useHomeStats.test.ts` | Modify — add tests for `computeCalendarDays` |
| `apps/mobile/hooks/__tests__/useSavedDecks.test.ts` | Create — unit tests |
| `apps/mobile/app/(tabs)/index.tsx` | Modify — add 7-day calendar strip |
| `apps/mobile/app/(tabs)/practice.tsx` | Modify — add Saved Decks section + create deck modal |
| `apps/mobile/app/practice/deck/[deckId].tsx` | Create — deck flashcard engine |

---

## Task 1: Schema — `saved_decks` table

- [ ] Add to `apps/mobile/db/schema.ts`:

```ts
export const savedDecks = sqliteTable('saved_decks', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  topicIds: text('topic_ids').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
})
```

- [ ] Add to `CREATE_SQL` in `apps/mobile/db/client.ts`:

```sql
CREATE TABLE IF NOT EXISTS saved_decks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  topic_ids TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);
```

- [ ] Commit:
```bash
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(mobile): add saved_decks table to local schema"
```

---

## Task 2: useHomeStats — `calendarDays`

Add a `computeCalendarDays` pure function and `calendarDays: CalendarDay[]` to the `HomeStats` interface. The strip shows 7 days centered on today.

```ts
export interface CalendarDay {
  date: Date
  dayLetter: string   // 'S' | 'M' | 'T' | 'W' | 'T' | 'F' | 'S'
  dayNum: number
  isToday: boolean
  hasExam: boolean    // any listing has examDate on this day
  hasPractice: boolean // user has any userProgress.answeredAt on this day
}
```

`computeCalendarDays` is a pure function — exported for unit tests.

---

## Task 3: Home screen — 7-day calendar strip

Placed between the greeting row and the Kuya Baw card. A horizontal `View` with 7 day circles. No library — pure `StyleSheet`.

Design:
- Each day: letter on top, number below, activity dot at bottom
- Today: white bg, dark text
- Has-exam: red border ring
- Has-practice: cyan dot below number
- Past days: 40% opacity

---

## Task 4: `useSavedDecks` hook

```ts
interface SavedDeck {
  id: string
  name: string
  topicIds: string[]
  createdAt: number
}

interface UseSavedDecks {
  decks: SavedDeck[]
  createDeck: (name: string, topicIds: string[]) => Promise<void>
  deleteDeck: (id: string) => Promise<void>
}
```

Uses `useFocusEffect` to reload on tab focus.

---

## Task 5: Practice Hub — Saved Decks section

- Saved Decks section header row with "+" button
- Deck cards: name, N topics, total card count
- Tap deck → navigate to `/practice/deck/[deckId]`
- Long-press deck → confirm delete alert
- "+" → Modal with:
  - Step 1: TextInput for deck name
  - Step 2: Topic multi-select (FlatList with checkboxes)
  - "Create" confirms

---

## Task 6: Deck Flashcard Engine

New route: `app/practice/deck/[deckId].tsx`

Same flip/correct/wrong UX as `[topicId].tsx`. Key differences:
- Loads the deck by ID → parses `topicIds` JSON
- Queries `flashcards WHERE topicId IN (...)` for all topics in the deck
- Shows deck name in the top bar
- Results screen shows accuracy + "Practice Again" + "Back to Decks"
