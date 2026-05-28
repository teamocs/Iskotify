# Notes Core + Swipe Navigation Implementation Plan (PR 16a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Google Keep–style notes feature to Iskotify, accessible by swiping right from the Home dashboard, with full SQLite persistence, export, and Supabase sync.

**Architecture:** Three new SQLite tables (`notes`, `noteLabels`, `noteLabelAssignments`) managed by two hooks (`useNotes`, `useNoteLabels`). The Notes screen lives at `app/notes/index.tsx` (a non-tab Stack screen) and is reached by a one-line enhancement to `EdgeSwipeNavigator`. Sub-screens (editor, archive, trash, labels) are standard Stack pushes. Export and sync extend the existing full-replace pattern.

**Tech Stack:** Expo Router (Stack), React Native Gesture Handler, Drizzle ORM + Expo SQLite, Supabase (`user_app_data` table), `useFocusEffect` from expo-router, `react-native-safe-area-context`.

---

## File Structure

| Path | Status | Responsibility |
|------|--------|---------------|
| `apps/mobile/db/schema.ts` | Modify | Add notes, noteLabels, noteLabelAssignments table definitions |
| `apps/mobile/db/client.ts` | Modify | Append 7 migration SQL strings |
| `apps/mobile/hooks/useNotes.ts` | Create | Notes CRUD + filter queries + pure helpers |
| `apps/mobile/hooks/__tests__/useNotes.test.ts` | Create | Unit tests for pure helpers |
| `apps/mobile/hooks/useNoteLabels.ts` | Create | Labels + assignments CRUD |
| `apps/mobile/hooks/__tests__/useNoteLabels.test.ts` | Create | Unit tests for pure helpers |
| `apps/mobile/components/EdgeSwipeNavigator.tsx` | Modify | Handle `/` → `/notes` and `/notes` → back |
| `apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx` | Modify | Add swipe-to-notes test cases |
| `apps/mobile/app/notes/index.tsx` | Create | Notes main grid screen |
| `apps/mobile/app/notes/[id].tsx` | Create | Note editor screen |
| `apps/mobile/app/notes/archive.tsx` | Create | Archived notes screen |
| `apps/mobile/app/notes/trash.tsx` | Create | Trash screen |
| `apps/mobile/app/notes/labels.tsx` | Create | Labels manager screen |
| `apps/mobile/services/export.ts` | Modify | Add notes/labels/assignments to export + import |
| `apps/mobile/services/__tests__/export.test.ts` | Modify | Tests for notes export/import |
| `apps/mobile/services/sync.ts` | Modify | Add notes/labels/assignments to push + pull |

---

## Task 1: DB Schema — notes, noteLabels, noteLabelAssignments

**Files:**
- Modify: `apps/mobile/db/schema.ts`
- Modify: `apps/mobile/db/client.ts`

- [ ] **Step 1: Add three tables to schema.ts**

Open `apps/mobile/db/schema.ts`. At the bottom, after the `chatMessages` export, add:

```typescript
export const notes = sqliteTable('notes', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default(''),
  content: text('content').notNull().default(''),
  type: text('type').notNull().default('text'),
  color: text('color'),
  isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
  isTrashed: integer('is_trashed', { mode: 'boolean' }).notNull().default(false),
  trashedAt: integer('trashed_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [
  index('notes_updated_at_idx').on(t.updatedAt),
  index('notes_archived_idx').on(t.isArchived),
  index('notes_trashed_idx').on(t.isTrashed),
])

export const noteLabels = sqliteTable('note_labels', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: integer('created_at').notNull(),
})

export const noteLabelAssignments = sqliteTable('note_label_assignments', {
  noteId: text('note_id').notNull(),
  labelId: text('label_id').notNull(),
}, (t) => [
  primaryKey({ columns: [t.noteId, t.labelId] }),
  index('note_label_assignments_note_idx').on(t.noteId),
])
```

- [ ] **Step 2: Append 7 migration SQL strings to client.ts**

Open `apps/mobile/db/client.ts`. At the end of the `MIGRATIONS` array (after the last `chat_messages_created_at_idx` entry), append:

```typescript
  `CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'text',
    color TEXT,
    is_pinned INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    is_trashed INTEGER NOT NULL DEFAULT 0,
    trashed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes (updated_at)`,
  `CREATE INDEX IF NOT EXISTS notes_archived_idx ON notes (is_archived)`,
  `CREATE INDEX IF NOT EXISTS notes_trashed_idx ON notes (is_trashed)`,
  `CREATE TABLE IF NOT EXISTS note_labels (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS note_label_assignments (
    note_id TEXT NOT NULL,
    label_id TEXT NOT NULL,
    PRIMARY KEY (note_id, label_id)
  )`,
  `CREATE INDEX IF NOT EXISTS note_label_assignments_note_idx ON note_label_assignments (note_id)`,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from `apps/mobile/`:
```
npx tsc --noEmit
```
Expected: no new type errors.

- [ ] **Step 4: Commit**

```
git add apps/mobile/db/schema.ts apps/mobile/db/client.ts
git commit -m "feat(notes): add notes, note_labels, note_label_assignments schema + migrations"
```

---

## Task 2: useNotes Hook

**Files:**
- Create: `apps/mobile/hooks/useNotes.ts`
- Create: `apps/mobile/hooks/__tests__/useNotes.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `apps/mobile/hooks/__tests__/useNotes.test.ts`:

```typescript
import { parseChecklistItems, makeNoteId } from '../useNotes'

describe('parseChecklistItems', () => {
  it('returns parsed array for valid JSON', () => {
    const raw = JSON.stringify([
      { id: 'a', text: 'Buy pencils', isChecked: false },
      { id: 'b', text: 'Submit form', isChecked: true },
    ])
    expect(parseChecklistItems(raw)).toEqual([
      { id: 'a', text: 'Buy pencils', isChecked: false },
      { id: 'b', text: 'Submit form', isChecked: true },
    ])
  })

  it('returns empty array for empty JSON array', () => {
    expect(parseChecklistItems('[]')).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseChecklistItems('not-json')).toEqual([])
  })

  it('returns empty array for JSON non-array', () => {
    expect(parseChecklistItems('"just a string"')).toEqual([])
  })

  it('filters out items missing required fields', () => {
    const raw = JSON.stringify([
      { id: 'a', text: 'ok', isChecked: false },
      { id: 'b', text: 'missing isChecked' },
      { text: 'missing id', isChecked: false },
    ])
    expect(parseChecklistItems(raw)).toEqual([{ id: 'a', text: 'ok', isChecked: false }])
  })

  it('filters out non-object items', () => {
    const raw = JSON.stringify([{ id: 'a', text: 'ok', isChecked: false }, null, 42, 'str'])
    expect(parseChecklistItems(raw)).toEqual([{ id: 'a', text: 'ok', isChecked: false }])
  })
})

describe('makeNoteId', () => {
  it('starts with note_', () => {
    expect(makeNoteId()).toMatch(/^note_/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeNoteId()))
    expect(ids.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/mobile && npx jest hooks/__tests__/useNotes.test.ts --no-coverage
```
Expected: FAIL — `parseChecklistItems` and `makeNoteId` not found.

- [ ] **Step 3: Create hooks/useNotes.ts**

```typescript
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { desc, and, eq, lt } from 'drizzle-orm'
import { useDb } from './useDb'
import { notes as notesTable, noteLabelAssignments } from '../db/schema'

export type NoteType = 'text' | 'checklist'
export type NoteColor =
  | 'red' | 'pink' | 'orange' | 'yellow' | 'teal' | 'green'
  | 'cyan' | 'blue' | 'cerulean' | 'purple' | 'gray' | null

export interface ChecklistItem {
  id: string
  text: string
  isChecked: boolean
}

export interface Note {
  id: string
  title: string
  content: string
  type: NoteType
  color: NoteColor
  isPinned: boolean
  isArchived: boolean
  isTrashed: boolean
  trashedAt: number | null
  createdAt: number
  updatedAt: number
}

export const NOTE_COLORS: Record<string, string> = {
  red: '#F28B82',
  pink: '#F6C0C0',
  orange: '#FBBC04',
  yellow: '#FFF475',
  teal: '#CCFF90',
  green: '#E6F4EA',
  cyan: '#D3F0F4',
  blue: '#AECBFA',
  cerulean: '#D4E6F1',
  purple: '#E8CEFC',
  gray: '#E8EAED',
}

export function makeNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function parseChecklistItems(content: string): ChecklistItem[] {
  try {
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is ChecklistItem =>
      item != null &&
      typeof item === 'object' &&
      typeof item.id === 'string' &&
      typeof item.text === 'string' &&
      typeof item.isChecked === 'boolean'
    )
  } catch {
    return []
  }
}

function mapRow(r: typeof notesTable.$inferSelect): Note {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    type: r.type as NoteType,
    color: (r.color as NoteColor) ?? null,
    isPinned: Boolean(r.isPinned),
    isArchived: Boolean(r.isArchived),
    isTrashed: Boolean(r.isTrashed),
    trashedAt: r.trashedAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export interface UseNotes {
  notes: Note[]
  createNote: (type: NoteType) => Promise<string>
  updateNote: (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'isPinned'>>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
  archiveNote: (id: string) => Promise<void>
  unarchiveNote: (id: string) => Promise<void>
  restoreNote: (id: string) => Promise<void>
  permanentlyDeleteNote: (id: string) => Promise<void>
  emptyTrash: () => Promise<void>
  pruneOldTrashedNotes: () => Promise<void>
}

export function useNotes(filter: 'active' | 'archived' | 'trashed' = 'active'): UseNotes {
  const db = useDb()
  const [notesList, setNotesList] = useState<Note[]>([])

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      let rows: typeof notesTable.$inferSelect[]
      if (filter === 'active') {
        rows = await db.select().from(notesTable)
          .where(and(eq(notesTable.isArchived, false), eq(notesTable.isTrashed, false)))
          .orderBy(desc(notesTable.isPinned), desc(notesTable.updatedAt))
      } else if (filter === 'archived') {
        rows = await db.select().from(notesTable)
          .where(and(eq(notesTable.isArchived, true), eq(notesTable.isTrashed, false)))
          .orderBy(desc(notesTable.updatedAt))
      } else {
        rows = await db.select().from(notesTable)
          .where(eq(notesTable.isTrashed, true))
          .orderBy(desc(notesTable.updatedAt))
      }
      if (!cancelled) setNotesList(rows.map(mapRow))
    }
    void load()
    return () => { cancelled = true }
  }, [db, filter]))

  const createNote = useCallback(async (type: NoteType): Promise<string> => {
    const id = makeNoteId()
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: '',
      content: type === 'checklist' ? '[]' : '',
      type,
      color: null,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    return id
  }, [db])

  const updateNote = useCallback(async (
    id: string,
    patch: Partial<Pick<Note, 'title' | 'content' | 'color' | 'isPinned'>>,
  ) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ ...patch, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.map(n =>
      n.id === id ? { ...n, ...patch, updatedAt: now } : n
    ))
  }, [db])

  const deleteNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isTrashed: true, trashedAt: now, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const archiveNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isArchived: true, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const unarchiveNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isArchived: false, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const restoreNote = useCallback(async (id: string) => {
    const now = Date.now()
    await db.update(notesTable)
      .set({ isTrashed: false, trashedAt: null, updatedAt: now })
      .where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const permanentlyDeleteNote = useCallback(async (id: string) => {
    await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, id))
    await db.delete(notesTable).where(eq(notesTable.id, id))
    setNotesList(prev => prev.filter(n => n.id !== id))
  }, [db])

  const emptyTrash = useCallback(async () => {
    const trashed = await db.select({ id: notesTable.id })
      .from(notesTable).where(eq(notesTable.isTrashed, true))
    for (const row of trashed) {
      await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, row.id))
    }
    await db.delete(notesTable).where(eq(notesTable.isTrashed, true))
    setNotesList([])
  }, [db])

  const pruneOldTrashedNotes = useCallback(async () => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    const old = await db.select({ id: notesTable.id })
      .from(notesTable)
      .where(and(eq(notesTable.isTrashed, true), lt(notesTable.trashedAt, cutoff)))
    for (const row of old) {
      await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.noteId, row.id))
    }
    await db.delete(notesTable)
      .where(and(eq(notesTable.isTrashed, true), lt(notesTable.trashedAt, cutoff)))
  }, [db])

  return {
    notes: notesList,
    createNote,
    updateNote,
    deleteNote,
    archiveNote,
    unarchiveNote,
    restoreNote,
    permanentlyDeleteNote,
    emptyTrash,
    pruneOldTrashedNotes,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/mobile && npx jest hooks/__tests__/useNotes.test.ts --no-coverage
```
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/useNotes.ts apps/mobile/hooks/__tests__/useNotes.test.ts
git commit -m "feat(notes): add useNotes hook with CRUD and parseChecklistItems helper"
```

---

## Task 3: useNoteLabels Hook

**Files:**
- Create: `apps/mobile/hooks/useNoteLabels.ts`
- Create: `apps/mobile/hooks/__tests__/useNoteLabels.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/hooks/__tests__/useNoteLabels.test.ts`:

```typescript
import { makeLabelId } from '../useNoteLabels'

describe('makeLabelId', () => {
  it('starts with label_', () => {
    expect(makeLabelId()).toMatch(/^label_/)
  })

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => makeLabelId()))
    expect(ids.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
cd apps/mobile && npx jest hooks/__tests__/useNoteLabels.test.ts --no-coverage
```
Expected: FAIL — `makeLabelId` not found.

- [ ] **Step 3: Create hooks/useNoteLabels.ts**

```typescript
import { useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { eq, asc } from 'drizzle-orm'
import { useDb } from './useDb'
import { noteLabels as noteLabelsTable, noteLabelAssignments } from '../db/schema'

export interface NoteLabel {
  id: string
  name: string
  createdAt: number
}

export interface UseNoteLabels {
  labels: NoteLabel[]
  assignedLabelIds: (noteId: string) => Promise<string[]>
  createLabel: (name: string) => Promise<string>
  renameLabel: (id: string, name: string) => Promise<void>
  deleteLabel: (id: string) => Promise<void>
  assignLabel: (noteId: string, labelId: string) => Promise<void>
  unassignLabel: (noteId: string, labelId: string) => Promise<void>
}

export function makeLabelId(): string {
  return `label_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

export function useNoteLabels(): UseNoteLabels {
  const db = useDb()
  const [labels, setLabels] = useState<NoteLabel[]>([])

  useFocusEffect(useCallback(() => {
    let cancelled = false
    void db.select().from(noteLabelsTable).orderBy(asc(noteLabelsTable.name)).then(rows => {
      if (!cancelled) setLabels(rows)
    })
    return () => { cancelled = true }
  }, [db]))

  const assignedLabelIds = useCallback(async (noteId: string): Promise<string[]> => {
    const rows = await db.select({ labelId: noteLabelAssignments.labelId })
      .from(noteLabelAssignments)
      .where(eq(noteLabelAssignments.noteId, noteId))
    return rows.map(r => r.labelId)
  }, [db])

  const createLabel = useCallback(async (name: string): Promise<string> => {
    const trimmed = name.trim()
    if (!trimmed) return ''
    const id = makeLabelId()
    await db.insert(noteLabelsTable).values({ id, name: trimmed, createdAt: Date.now() })
    setLabels(prev => [...prev, { id, name: trimmed, createdAt: Date.now() }]
      .sort((a, b) => a.name.localeCompare(b.name)))
    return id
  }, [db])

  const renameLabel = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.update(noteLabelsTable).set({ name: trimmed }).where(eq(noteLabelsTable.id, id))
    setLabels(prev => prev.map(l => l.id === id ? { ...l, name: trimmed } : l)
      .sort((a, b) => a.name.localeCompare(b.name)))
  }, [db])

  const deleteLabel = useCallback(async (id: string) => {
    await db.delete(noteLabelAssignments).where(eq(noteLabelAssignments.labelId, id))
    await db.delete(noteLabelsTable).where(eq(noteLabelsTable.id, id))
    setLabels(prev => prev.filter(l => l.id !== id))
  }, [db])

  const assignLabel = useCallback(async (noteId: string, labelId: string) => {
    await db.insert(noteLabelAssignments)
      .values({ noteId, labelId })
      .onConflictDoNothing()
  }, [db])

  const unassignLabel = useCallback(async (noteId: string, labelId: string) => {
    await db.delete(noteLabelAssignments)
      .where(and(eq(noteLabelAssignments.noteId, noteId), eq(noteLabelAssignments.labelId, labelId)))
  }, [db])

  return { labels, assignedLabelIds, createLabel, renameLabel, deleteLabel, assignLabel, unassignLabel }
}
```

Note: add `import { and } from 'drizzle-orm'` to the imports line since `unassignLabel` uses `and`.

- [ ] **Step 4: Run tests to verify they pass**

```
cd apps/mobile && npx jest hooks/__tests__/useNoteLabels.test.ts --no-coverage
```
Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```
git add apps/mobile/hooks/useNoteLabels.ts apps/mobile/hooks/__tests__/useNoteLabels.test.ts
git commit -m "feat(notes): add useNoteLabels hook"
```

---

## Task 4: EdgeSwipeNavigator — swipe right from Home → Notes

**Files:**
- Modify: `apps/mobile/components/EdgeSwipeNavigator.tsx`
- Modify: `apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx`

- [ ] **Step 1: Write failing tests first**

Open `apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx`. Add to the mock at the top:

```typescript
// Change the router mock line from:
const mockNavigate = jest.fn()
// to:
const mockNavigate = jest.fn()
const mockBack = jest.fn()
```

And change the `jest.mock('expo-router', ...)` to include `router.back`:

```typescript
jest.mock('expo-router', () => ({
  router: {
    navigate: (...args: unknown[]) => mockNavigate(...args),
    back: () => mockBack(),
  },
  usePathname: () => mockUsePathname(),
}))
```

Add the new test cases at the end of the `describe` block:

```typescript
  it('navigates Home → /notes on right swipe from /', () => {
    mockUsePathname.mockReturnValue('/')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: 200, velocityX: 800 })
    expect(mockNavigate).toHaveBeenCalledWith('/notes')
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('calls router.back on left swipe from /notes', () => {
    mockUsePathname.mockReturnValue('/notes')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: -200, velocityX: -800 })
    expect(mockBack).toHaveBeenCalledTimes(1)
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('no-op on right swipe from /notes (already at notes)', () => {
    mockUsePathname.mockReturnValue('/notes')
    render(<EdgeSwipeNavigator><Text>x</Text></EdgeSwipeNavigator>)
    getOnEndCallback()({ translationX: 200, velocityX: 800 })
    expect(mockNavigate).not.toHaveBeenCalled()
    expect(mockBack).not.toHaveBeenCalled()
  })
```

Also update `beforeEach` to clear `mockBack`:

```typescript
  beforeEach(() => {
    mockNavigate.mockClear()
    mockBack.mockClear()
    // ... rest of existing beforeEach
  })
```

- [ ] **Step 2: Run to verify new tests fail**

```
cd apps/mobile && npx jest components/__tests__/EdgeSwipeNavigator.test.tsx --no-coverage
```
Expected: existing tests PASS, 3 new tests FAIL (wrong navigate call or back not called).

- [ ] **Step 3: Update EdgeSwipeNavigator.tsx**

Replace the entire `navigateTo` callback in `apps/mobile/components/EdgeSwipeNavigator.tsx`:

```typescript
import { useCallback, useMemo } from 'react'
import { View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { router, usePathname } from 'expo-router'

const TAB_PATHS = ['/', '/practice', '/listings', '/analytics', '/profile'] as const
const TAB_HREFS = [
  '/(tabs)',
  '/(tabs)/practice',
  '/(tabs)/listings',
  '/(tabs)/analytics',
  '/(tabs)/profile',
] as const

const NOTES_PATH = '/notes'
const SWIPE_DISTANCE = 50
const SWIPE_VELOCITY = 300

export function EdgeSwipeNavigator({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const navigateTo = useCallback((direction: 'left' | 'right') => {
    // Home ↔ Notes swipe
    if (direction === 'right' && pathname === '/') {
      router.navigate(NOTES_PATH as never)
      return
    }
    if (direction === 'left' && pathname === NOTES_PATH) {
      router.back()
      return
    }
    // Standard tab swipe
    const idx = (TAB_PATHS as readonly string[]).indexOf(pathname)
    if (idx === -1) return
    const next = direction === 'left' ? idx + 1 : idx - 1
    if (next < 0 || next >= TAB_HREFS.length) return
    router.navigate(TAB_HREFS[next] as never)
  }, [pathname])

  const pan = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-15, 15])
      .failOffsetY([-15, 15])
      .onEnd((e) => {
        'worklet'
        const swipeLeft = e.translationX < -SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
        const swipeRight = e.translationX > SWIPE_DISTANCE && Math.abs(e.velocityX) > SWIPE_VELOCITY
        if (swipeLeft) runOnJS(navigateTo)('left')
        else if (swipeRight) runOnJS(navigateTo)('right')
      }),
  [navigateTo])

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  )
}
```

- [ ] **Step 4: Run all EdgeSwipeNavigator tests**

```
cd apps/mobile && npx jest components/__tests__/EdgeSwipeNavigator.test.tsx --no-coverage
```
Expected: all 12 tests PASS (9 existing + 3 new).

- [ ] **Step 5: Commit**

```
git add apps/mobile/components/EdgeSwipeNavigator.tsx apps/mobile/components/__tests__/EdgeSwipeNavigator.test.tsx
git commit -m "feat(notes): extend EdgeSwipeNavigator — swipe right from Home navigates to /notes"
```

---

## Task 5: Notes Main Grid Screen

**Files:**
- Create: `apps/mobile/app/notes/index.tsx`

The `EdgeSwipeNavigator` already wraps the tabs layout. When the user is on the Notes screen and swipes left, it calls `router.back()`. For the gesture to work on the Notes screen, wrap the Notes content with `<EdgeSwipeNavigator>` as well — `EdgeSwipeNavigator` handles both tabs and the `/notes` path.

- [ ] **Step 1: Create apps/mobile/app/notes/index.tsx**

```typescript
import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Pressable, Modal, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note, type NoteType } from '../../hooks/useNotes'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'

function NoteCard({
  note,
  onPress,
  onLongPress,
  selected,
}: {
  note: Note
  onPress: () => void
  onLongPress: () => void
  selected: boolean
}) {
  const { theme: t, typo } = useTheme()
  const bg = note.color ? NOTE_COLORS[note.color] : t.surface
  const textColor = note.color ? '#2d0a0a' : t.textPrimary
  const subColor = note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        {
          backgroundColor: bg,
          borderRadius: 12,
          padding: 12,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? '#800000' : (note.color ? 'rgba(0,0,0,0.1)' : t.border),
          flex: 1,
        },
      ]}
    >
      {note.isPinned && (
        <Text style={{ fontSize: 10, color: subColor, marginBottom: 4 }}>📌 Pinned</Text>
      )}
      {note.title.length > 0 && (
        <Text
          style={{ fontSize: typo.sm, fontWeight: '700', color: textColor, fontFamily: 'Outfit_700Bold', marginBottom: 4 }}
          numberOfLines={2}
        >
          {note.title}
        </Text>
      )}
      {note.type === 'text' && note.content.length > 0 && (
        <Text
          style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular', lineHeight: 16 }}
          numberOfLines={4}
        >
          {note.content}
        </Text>
      )}
      {note.type === 'checklist' && (() => {
        try {
          const items = JSON.parse(note.content) as Array<{ text: string; isChecked: boolean }>
          return (
            <View style={{ gap: 3 }}>
              {items.slice(0, 5).map((item, i) => (
                <Text key={i} style={{ fontSize: typo.xs, color: item.isChecked ? subColor : textColor, fontFamily: 'Lexend_400Regular', textDecorationLine: item.isChecked ? 'line-through' : 'none' }} numberOfLines={1}>
                  {item.isChecked ? '☑ ' : '☐ '}{item.text}
                </Text>
              ))}
              {items.length > 5 && (
                <Text style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular' }}>
                  +{items.length - 5} more
                </Text>
              )}
            </View>
          )
        } catch { return null }
      })()}
    </Pressable>
  )
}

export default function NotesScreen() {
  const { theme: t, typo } = useTheme()
  const { notes, createNote, archiveNote, deleteNote, pinNote: _pinNote } = useNotes('active') as any
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fabOpen, setFabOpen] = useState(false)

  const { updateNote } = useNotes('active')

  const filtered = useMemo(() => {
    if (!search.trim()) return notes as Note[]
    const q = search.toLowerCase()
    return (notes as Note[]).filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    )
  }, [notes, search])

  const pinned = filtered.filter(n => n.isPinned)
  const others = filtered.filter(n => !n.isPinned)

  const handleCreate = useCallback(async (type: NoteType) => {
    setFabOpen(false)
    const id = await createNote(type)
    router.push(`/notes/${id}` as never)
  }, [createNote])

  const handlePress = useCallback((note: Note) => {
    if (selected.size > 0) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(note.id)) next.delete(note.id)
        else next.add(note.id)
        return next
      })
    } else {
      router.push(`/notes/${note.id}` as never)
    }
  }, [selected])

  const handleLongPress = useCallback((note: Note) => {
    setSelected(prev => new Set(prev).add(note.id))
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const bulkArchive = useCallback(async () => {
    for (const id of selected) await archiveNote(id)
    clearSelection()
  }, [selected, archiveNote, clearSelection])

  const bulkDelete = useCallback(async () => {
    Alert.alert('Move to Trash', `Move ${selected.size} note(s) to trash?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move', style: 'destructive',
        onPress: async () => {
          for (const id of selected) await deleteNote(id)
          clearSelection()
        },
      },
    ])
  }, [selected, deleteNote, clearSelection])

  const bulkPin = useCallback(async () => {
    for (const id of selected) await updateNote(id, { isPinned: true })
    clearSelection()
  }, [selected, updateNote, clearSelection])

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    overflowBtn: { flexDirection: 'row', gap: 8 },
    menuBtn: { width: 36, height: 36, backgroundColor: t.surface2, borderRadius: 12, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    menuBtnTxt: { fontSize: 16 },
    searchBar: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    content: { paddingHorizontal: 12, paddingBottom: 100 },
    sectionHeader: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', paddingHorizontal: 4, paddingVertical: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
    fab: { position: 'absolute', bottom: 28, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
    fabTxt: { color: '#fff', fontSize: 28, lineHeight: 32, marginTop: -2 },
    fabSub: { position: 'absolute', bottom: 90, right: 20, gap: 8 },
    fabSubBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
    fabSubTxt: { fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    selBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
    selCount: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    selAction: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', paddingVertical: 4, paddingHorizontal: 8 },
  }), [t, typo])

  const renderGrid = (items: Note[]) => (
    <View style={s.grid}>
      {items.map(note => (
        <View key={note.id} style={s.cardWrap}>
          <NoteCard
            note={note}
            onPress={() => handlePress(note)}
            onLongPress={() => handleLongPress(note)}
            selected={selected.has(note.id)}
          />
        </View>
      ))}
    </View>
  )

  return (
    <EdgeSwipeNavigator>
      <SafeAreaView style={s.root}>
        <Stack.Screen options={{ animation: 'slide_from_left', headerShown: false }} />

        <View style={s.header}>
          <View style={s.titleRow}>
            <Text style={s.title}>Notes</Text>
            <View style={s.overflowBtn}>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/archive' as never)}>
                <Text style={s.menuBtnTxt}>📦</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/trash' as never)}>
                <Text style={s.menuBtnTxt}>🗑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/labels' as never)}>
                <Text style={s.menuBtnTxt}>🏷</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={s.searchBar}
            placeholder="Search notes…"
            placeholderTextColor={t.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyTxt}>
                {search ? 'No notes match your search' : 'Tap + to create your first note'}
              </Text>
            </View>
          )}

          {pinned.length > 0 && (
            <>
              <Text style={s.sectionHeader}>Pinned</Text>
              {renderGrid(pinned)}
            </>
          )}

          {pinned.length > 0 && others.length > 0 && (
            <Text style={s.sectionHeader}>Other notes</Text>
          )}

          {others.length > 0 && renderGrid(others)}
        </ScrollView>

        {/* FAB */}
        {selected.size === 0 && (
          <>
            {fabOpen && (
              <View style={s.fabSub}>
                <TouchableOpacity style={s.fabSubBtn} onPress={() => handleCreate('text')}>
                  <Text style={s.fabSubTxt}>📝 Text note</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.fabSubBtn} onPress={() => handleCreate('checklist')}>
                  <Text style={s.fabSubTxt}>☑ Checklist</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={s.fab}
              onPress={() => setFabOpen(o => !o)}
              onLongPress={() => handleCreate('text')}
            >
              <Text style={s.fabTxt}>{fabOpen ? '✕' : '+'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Selection action bar */}
        {selected.size > 0 && (
          <View style={s.selBar}>
            <Text style={s.selCount}>{selected.size} selected</Text>
            <TouchableOpacity onPress={bulkPin}>
              <Text style={s.selAction}>📌 Pin</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={bulkArchive}>
              <Text style={s.selAction}>📦 Archive</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={bulkDelete}>
              <Text style={s.selAction}>🗑 Trash</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSelection}>
              <Text style={s.selAction}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </EdgeSwipeNavigator>
  )
}
```

- [ ] **Step 2: TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors related to notes screens.

- [ ] **Step 3: Commit**

```
git add apps/mobile/app/notes/index.tsx
git commit -m "feat(notes): add Notes main grid screen with search, sections, FAB, and multi-select"
```

---

## Task 6: Note Editor Screen

**Files:**
- Create: `apps/mobile/app/notes/[id].tsx`

- [ ] **Step 1: Create apps/mobile/app/notes/[id].tsx**

```typescript
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { NOTE_COLORS, parseChecklistItems, type NoteColor, type NoteType, type ChecklistItem } from '../../hooks/useNotes'
import { notes as notesTable } from '../../db/schema'

const COLOR_KEYS = [null, 'red', 'pink', 'orange', 'yellow', 'teal', 'green', 'cyan', 'blue', 'cerulean', 'purple', 'gray'] as const

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const { labels, assignedLabelIds, assignLabel, unassignLabel } = useNoteLabels()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<NoteType>('text')
  const [color, setColor] = useState<NoteColor>(null)
  const [checkItems, setCheckItems] = useState<ChecklistItem[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load note on mount
  useEffect(() => {
    if (!id) return
    void db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1).then(rows => {
      const row = rows[0]
      if (!row) return
      setTitle(row.title)
      setContent(row.content)
      setType(row.type as NoteType)
      setColor((row.color as NoteColor) ?? null)
      if (row.type === 'checklist') {
        setCheckItems(parseChecklistItems(row.content))
      }
      setLoaded(true)
    })
    void assignedLabelIds(id).then(setAssignedIds)
  }, [id, db, assignedLabelIds])

  // Auto-save debounced 500ms
  const save = useCallback(async (t2: string, c2: string, ci: ChecklistItem[], clr: NoteColor) => {
    if (!id || !loaded) return
    const finalContent = type === 'checklist' ? JSON.stringify(ci) : c2
    await db.update(notesTable)
      .set({ title: t2, content: finalContent, color: clr, updatedAt: Date.now() })
      .where(eq(notesTable.id, id))
  }, [id, loaded, type, db])

  useEffect(() => {
    if (!loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void save(title, content, checkItems, color)
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [title, content, checkItems, color, loaded, save])

  const handleArchive = useCallback(async () => {
    if (!id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await db.update(notesTable).set({ isArchived: true, updatedAt: Date.now() }).where(eq(notesTable.id, id))
    router.back()
  }, [id, db])

  const handleDelete = useCallback(async () => {
    if (!id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await db.update(notesTable).set({ isTrashed: true, trashedAt: Date.now(), updatedAt: Date.now() }).where(eq(notesTable.id, id))
    router.back()
  }, [id, db])

  const addCheckItem = useCallback(() => {
    const newItem: ChecklistItem = {
      id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: '',
      isChecked: false,
    }
    setCheckItems(prev => [...prev, newItem])
  }, [])

  const toggleCheck = useCallback((itemId: string) => {
    setCheckItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, isChecked: !ci.isChecked } : ci))
  }, [])

  const updateCheckText = useCallback((itemId: string, text: string) => {
    setCheckItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, text } : ci))
  }, [])

  const removeCheckItem = useCallback((itemId: string) => {
    setCheckItems(prev => prev.filter(ci => ci.id !== itemId))
  }, [])

  const toggleLabelAssign = useCallback(async (labelId: string) => {
    if (assignedIds.includes(labelId)) {
      await unassignLabel(id!, labelId)
      setAssignedIds(prev => prev.filter(l => l !== labelId))
    } else {
      await assignLabel(id!, labelId)
      setAssignedIds(prev => [...prev, labelId])
    }
  }, [assignedIds, id, assignLabel, unassignLabel])

  const bgColor = color ? NOTE_COLORS[color] : t.bg
  const textCol = color ? '#2d0a0a' : t.textPrimary
  const subCol = color ? 'rgba(45,10,10,0.55)' : t.textSecondary

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: bgColor },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    backBtn: { padding: 8, marginRight: 4 },
    backTxt: { fontSize: typo.lg, color: textCol },
    titleInput: { flex: 1, fontSize: typo.lg, fontWeight: '700', color: textCol, fontFamily: 'Outfit_700Bold' },
    contentInput: { flex: 1, fontSize: typo.sm, color: textCol, fontFamily: 'Lexend_400Regular', lineHeight: 20, textAlignVertical: 'top', paddingHorizontal: 16, paddingBottom: 16 },
    checkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 5, gap: 10 },
    checkBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: textCol, alignItems: 'center', justifyContent: 'center' },
    checkMark: { fontSize: 13, color: textCol },
    checkInput: { flex: 1, fontSize: typo.sm, color: textCol, fontFamily: 'Lexend_400Regular' },
    checkedText: { textDecorationLine: 'line-through', color: subCol },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    addItemTxt: { fontSize: typo.sm, color: subCol, fontFamily: 'Lexend_400Regular' },
    toolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color ? 'rgba(0,0,0,0.1)' : t.border, paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
    colorRow: { flexDirection: 'row', gap: 6, flex: 1 },
    colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
    toolBtn: { padding: 8, borderRadius: 8 },
    toolBtnTxt: { fontSize: 18 },
    // Label picker modal
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16, maxHeight: '60%' },
    sheetTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 12 },
    labelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 12 },
    labelName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
    checkCircleOn: { backgroundColor: '#800000', borderColor: '#800000', alignItems: 'center', justifyContent: 'center' },
    checkCircleOff: { borderColor: t.textTertiary },
  }), [t, typo, bgColor, textCol, subCol, color])

  const unchecked = checkItems.filter(ci => !ci.isChecked)
  const checked = checkItems.filter(ci => ci.isChecked)

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>‹</Text>
          </TouchableOpacity>
          <TextInput
            style={s.titleInput}
            placeholder="Title"
            placeholderTextColor={subCol}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {type === 'text' ? (
            <TextInput
              style={s.contentInput}
              placeholder="Note…"
              placeholderTextColor={subCol}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
              minHeight={200}
            />
          ) : (
            <View>
              {unchecked.map(item => (
                <View key={item.id} style={s.checkRow}>
                  <TouchableOpacity style={s.checkBox} onPress={() => toggleCheck(item.id)}>
                    <Text style={s.checkMark}> </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.checkInput}
                    value={item.text}
                    onChangeText={t2 => updateCheckText(item.id, t2)}
                    placeholder="List item…"
                    placeholderTextColor={subCol}
                    onSubmitEditing={addCheckItem}
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity onPress={() => removeCheckItem(item.id)}>
                    <Text style={{ color: subCol, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addItemBtn} onPress={addCheckItem}>
                <Text style={{ color: subCol, fontSize: 20 }}>+</Text>
                <Text style={s.addItemTxt}>Add item</Text>
              </TouchableOpacity>
              {checked.length > 0 && (
                <>
                  <Text style={{ paddingHorizontal: 16, paddingTop: 8, fontSize: typo.xs, color: subCol, fontFamily: 'Lexend_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {checked.length} checked
                  </Text>
                  {checked.map(item => (
                    <View key={item.id} style={s.checkRow}>
                      <TouchableOpacity style={[s.checkBox, { backgroundColor: subCol }]} onPress={() => toggleCheck(item.id)}>
                        <Text style={s.checkMark}>✓</Text>
                      </TouchableOpacity>
                      <Text style={[s.checkInput, s.checkedText]}>{item.text}</Text>
                      <TouchableOpacity onPress={() => removeCheckItem(item.id)}>
                        <Text style={{ color: subCol, fontSize: 18 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={s.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={s.colorRow}>
              {COLOR_KEYS.map(key => (
                <TouchableOpacity
                  key={String(key)}
                  style={[
                    s.colorDot,
                    { backgroundColor: key ? NOTE_COLORS[key] : t.surface },
                    { borderColor: color === key ? '#800000' : (key ? 'rgba(0,0,0,0.2)' : t.border) },
                  ]}
                  onPress={() => setColor(key)}
                />
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity style={s.toolBtn} onPress={() => setShowLabelPicker(true)}>
            <Text style={s.toolBtnTxt}>🏷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.toolBtn} onPress={handleArchive}>
            <Text style={s.toolBtnTxt}>📦</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.toolBtn} onPress={handleDelete}>
            <Text style={s.toolBtnTxt}>🗑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Label picker modal */}
      <Modal visible={showLabelPicker} transparent animationType="slide" onRequestClose={() => setShowLabelPicker(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowLabelPicker(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Labels</Text>
            <ScrollView>
              {labels.length === 0 && (
                <Text style={{ color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm }}>
                  No labels yet. Create labels from the Notes screen (🏷 icon).
                </Text>
              )}
              {labels.map(label => {
                const on = assignedIds.includes(label.id)
                return (
                  <TouchableOpacity key={label.id} style={s.labelRow} onPress={() => toggleLabelAssign(label.id)}>
                    <Text style={s.labelName}>{label.name}</Text>
                    <View style={[s.checkCircle, on ? s.checkCircleOn : s.checkCircleOff]}>
                      {on && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```
git add apps/mobile/app/notes/[id].tsx
git commit -m "feat(notes): add note editor with text/checklist, auto-save, color picker, label picker"
```

---

## Task 7: Archive, Trash, and Labels Screens

**Files:**
- Create: `apps/mobile/app/notes/archive.tsx`
- Create: `apps/mobile/app/notes/trash.tsx`
- Create: `apps/mobile/app/notes/labels.tsx`

- [ ] **Step 1: Create apps/mobile/app/notes/archive.tsx**

```typescript
import { useMemo } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note } from '../../hooks/useNotes'

export default function ArchiveScreen() {
  const { theme: t, typo } = useTheme()
  const { notes, unarchiveNote, deleteNote } = useNotes('archived')

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    back: { padding: 8, marginRight: 8 },
    backTxt: { fontSize: typo.lg, color: t.textPrimary },
    screenTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    card: { borderRadius: 12, padding: 12, borderWidth: 1 },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    actionBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    actionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Archive</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {notes.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No archived notes</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {(notes as Note[]).map(note => {
              const bg = note.color ? NOTE_COLORS[note.color] : t.surface
              const textCol = note.color ? '#2d0a0a' : t.textPrimary
              return (
                <View key={note.id} style={s.cardWrap}>
                  <View style={[s.card, { backgroundColor: bg, borderColor: note.color ? 'rgba(0,0,0,0.1)' : t.border }]}>
                    {note.title.length > 0 && (
                      <Text style={[s.cardTitle, { color: textCol }]} numberOfLines={2}>{note.title}</Text>
                    )}
                    {note.type === 'text' && note.content.length > 0 && (
                      <Text style={[s.cardContent, { color: note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary }]} numberOfLines={3}>{note.content}</Text>
                    )}
                    <View style={s.cardActions}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => unarchiveNote(note.id)}>
                        <Text style={s.actionTxt}>Unarchive</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.actionBtn} onPress={() => deleteNote(note.id)}>
                        <Text style={s.actionTxt}>Trash</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 2: Create apps/mobile/app/notes/trash.tsx**

```typescript
import { useMemo } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note } from '../../hooks/useNotes'

export default function TrashScreen() {
  const { theme: t, typo } = useTheme()
  const { notes, restoreNote, permanentlyDeleteNote, emptyTrash, pruneOldTrashedNotes } = useNotes('trashed')

  // Prune on mount
  useMemo(() => { void pruneOldTrashedNotes() }, [pruneOldTrashedNotes])

  const handleEmptyTrash = () => {
    Alert.alert('Empty Trash', 'Permanently delete all notes in trash?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => void emptyTrash() },
    ])
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    back: { padding: 8, marginRight: 8 },
    backTxt: { fontSize: typo.lg, color: t.textPrimary },
    screenTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    emptyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#f87171' },
    emptyBtnTxt: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_400Regular' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    hint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingVertical: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    card: { borderRadius: 12, padding: 12, borderWidth: 1 },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
    actionBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    actionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    deleteBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#f87171' },
    deleteTxt: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_400Regular' },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Trash</Text>
        {(notes as Note[]).length > 0 && (
          <TouchableOpacity style={s.emptyBtn} onPress={handleEmptyTrash}>
            <Text style={s.emptyBtnTxt}>Empty</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {(notes as Note[]).length > 0 && (
          <Text style={s.hint}>Notes in trash are deleted after 7 days</Text>
        )}
        {(notes as Note[]).length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>Trash is empty</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {(notes as Note[]).map(note => {
              const bg = note.color ? NOTE_COLORS[note.color] : t.surface
              const textCol = note.color ? '#2d0a0a' : t.textPrimary
              return (
                <View key={note.id} style={s.cardWrap}>
                  <View style={[s.card, { backgroundColor: bg, borderColor: note.color ? 'rgba(0,0,0,0.1)' : t.border }]}>
                    {note.title.length > 0 && (
                      <Text style={[s.cardTitle, { color: textCol }]} numberOfLines={2}>{note.title}</Text>
                    )}
                    {note.type === 'text' && note.content.length > 0 && (
                      <Text style={[s.cardContent, { color: note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary }]} numberOfLines={3}>{note.content}</Text>
                    )}
                    <View style={s.cardActions}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => restoreNote(note.id)}>
                        <Text style={s.actionTxt}>Restore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.deleteBtn} onPress={() => permanentlyDeleteNote(note.id)}>
                        <Text style={s.deleteTxt}>Delete forever</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 3: Create apps/mobile/app/notes/labels.tsx**

```typescript
import { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNoteLabels } from '../../hooks/useNoteLabels'

export default function LabelsScreen() {
  const { theme: t, typo } = useTheme()
  const { labels, createLabel, renameLabel, deleteLabel } = useNoteLabels()
  const [newLabelName, setNewLabelName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleCreate = async () => {
    if (!newLabelName.trim()) return
    await createLabel(newLabelName)
    setNewLabelName('')
  }

  const handleRename = async (id: string) => {
    await renameLabel(id, editingName)
    setEditingId(null)
  }

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Label', `Delete "${name}"? This removes it from all notes.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteLabel(id) },
    ])
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    back: { padding: 8, marginRight: 8 },
    backTxt: { fontSize: typo.lg, color: t.textPrimary },
    screenTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    createRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    createInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    createBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#800000' },
    createBtnTxt: { color: '#fff', fontFamily: 'Lexend_500Medium', fontSize: typo.sm },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 12 },
    labelName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    editInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', borderBottomWidth: 1, borderBottomColor: t.accent, paddingVertical: 2 },
    rowBtn: { padding: 6 },
    rowBtnTxt: { fontSize: 16 },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Labels</Text>
      </View>
      <View style={s.createRow}>
        <TextInput
          style={s.createInput}
          placeholder="New label name…"
          placeholderTextColor={t.textTertiary}
          value={newLabelName}
          onChangeText={setNewLabelName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <TouchableOpacity style={s.createBtn} onPress={handleCreate}>
          <Text style={s.createBtnTxt}>Add</Text>
        </TouchableOpacity>
      </View>
      <ScrollView>
        {labels.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No labels yet</Text>
          </View>
        )}
        {labels.map(label => (
          <View key={label.id} style={s.row}>
            {editingId === label.id ? (
              <>
                <TextInput
                  style={s.editInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  onSubmitEditing={() => handleRename(label.id)}
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity style={s.rowBtn} onPress={() => handleRename(label.id)}>
                  <Text style={s.rowBtnTxt}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rowBtn} onPress={() => setEditingId(null)}>
                  <Text style={s.rowBtnTxt}>✕</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.labelName}>{label.name}</Text>
                <TouchableOpacity style={s.rowBtn} onPress={() => { setEditingId(label.id); setEditingName(label.name) }}>
                  <Text style={s.rowBtnTxt}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rowBtn} onPress={() => handleDelete(label.id, label.name)}>
                  <Text style={s.rowBtnTxt}>🗑</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
```

- [ ] **Step 4: TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```
git add apps/mobile/app/notes/archive.tsx apps/mobile/app/notes/trash.tsx apps/mobile/app/notes/labels.tsx
git commit -m "feat(notes): add archive, trash, and labels screens"
```

---

## Task 8: Export/Import Extension

**Files:**
- Modify: `apps/mobile/services/export.ts`
- Modify: `apps/mobile/services/__tests__/export.test.ts`

- [ ] **Step 1: Write the failing test**

Open `apps/mobile/services/__tests__/export.test.ts`. Add a new describe block at the bottom:

```typescript
describe('exportUserData includes notes fields', () => {
  it('writes JSON payload containing notes, note_labels, note_label_assignments keys', async () => {
    await exportUserData(makeDb({ selectedListingSlug: 'upcat', lastSyncedAt: 0 }) as any)
    const written: string = mockWriteAsStringAsync.mock.calls[0]![1] as string
    const parsed = JSON.parse(written) as Record<string, unknown>
    expect(parsed).toHaveProperty('notes')
    expect(parsed).toHaveProperty('note_labels')
    expect(parsed).toHaveProperty('note_label_assignments')
    expect(Array.isArray(parsed.notes)).toBe(true)
    expect(Array.isArray(parsed.note_labels)).toBe(true)
    expect(Array.isArray(parsed.note_label_assignments)).toBe(true)
  })
})
```

Also update `makeDb` to support the notes selects. The existing `makeDb` returns a chainable mock; we need it to handle additional `from()` calls. Replace `makeDb` with:

```typescript
function makeDb(settingsRow: { selectedListingSlug: string; lastSyncedAt: number } | null) {
  return {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue(settingsRow ? [settingsRow] : []),
        })),
        // For tables without where clause (e.g. focusListings, notes etc.)
        orderBy: jest.fn().mockResolvedValue([]),
        then: jest.fn().mockResolvedValue([]),
      })),
    })),
  }
}
```

Wait — the existing export test uses a simpler `makeDb`. Instead of modifying it (which risks breaking existing tests), add a new `makeDbFull` used only for the new test:

```typescript
function makeDbFull() {
  const selectResult = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([]),
    orderBy: jest.fn().mockResolvedValue([]),
  }
  return { select: jest.fn(() => selectResult) }
}
```

And update the new test to use it:

```typescript
describe('exportUserData includes notes fields', () => {
  it('writes JSON payload containing notes, note_labels, note_label_assignments keys', async () => {
    await exportUserData(makeDbFull() as any)
    const written: string = mockWriteAsStringAsync.mock.calls[0]![1] as string
    const parsed = JSON.parse(written) as Record<string, unknown>
    expect(parsed).toHaveProperty('notes')
    expect(parsed).toHaveProperty('note_labels')
    expect(parsed).toHaveProperty('note_label_assignments')
    expect(Array.isArray(parsed.notes)).toBe(true)
    expect(Array.isArray(parsed.note_labels)).toBe(true)
    expect(Array.isArray(parsed.note_label_assignments)).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
cd apps/mobile && npx jest services/__tests__/export.test.ts --no-coverage
```
Expected: existing tests PASS, new test FAIL (notes key missing from payload).

- [ ] **Step 3: Update services/export.ts**

Add the new imports at the top (add to the existing schema imports):

```typescript
import {
  userSettings,
  focusListings,
  savedListings,
  savedDecks,
  userProgress,
  practiceSessions,
  notes as notesTable,
  noteLabels,
  noteLabelAssignments,
} from '../db/schema'
```

In `exportUserData`, change the `Promise.all` to include notes queries:

```typescript
  const [settings, focus, saved, decks, progress, sessions, noteRows, labelRows, assignRows] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
  ])
```

And update the `payload` object:

```typescript
  const payload = {
    exported_at: new Date().toISOString(),
    settings: settings[0] ?? null,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
  }
```

In `importUserData`, after the `practice_sessions` import block, add:

```typescript
  // Notes — replace entirely
  await db.delete(noteLabelAssignments)
  await db.delete(notesTable)
  const noteImportRows = Array.isArray(data.notes) ? (data.notes as ExportRow[]) : []
  for (const row of noteImportRows) {
    const id = String(row.id ?? '')
    if (!id) continue
    await db.insert(notesTable).values({
      id,
      title: String(row.title ?? ''),
      content: String(row.content ?? ''),
      type: String(row.type ?? 'text'),
      color: row.color ? String(row.color) : null,
      isPinned: Boolean(row.isPinned ?? row.is_pinned ?? false),
      isArchived: Boolean(row.isArchived ?? row.is_archived ?? false),
      isTrashed: Boolean(row.isTrashed ?? row.is_trashed ?? false),
      trashedAt: row.trashedAt != null ? Number(row.trashedAt) : row.trashed_at != null ? Number(row.trashed_at) : null,
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
      updatedAt: Number(row.updatedAt ?? row.updated_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // Note labels — replace entirely
  await db.delete(noteLabels)
  const labelImportRows = Array.isArray(data.note_labels) ? (data.note_labels as ExportRow[]) : []
  for (const row of labelImportRows) {
    const id = String(row.id ?? '')
    if (!id) continue
    await db.insert(noteLabels).values({
      id,
      name: String(row.name ?? ''),
      createdAt: Number(row.createdAt ?? row.created_at ?? Date.now()),
    }).onConflictDoNothing()
  }

  // Note label assignments — replace entirely
  const assignImportRows = Array.isArray(data.note_label_assignments) ? (data.note_label_assignments as ExportRow[]) : []
  for (const row of assignImportRows) {
    const noteId = String(row.noteId ?? row.note_id ?? '')
    const labelId = String(row.labelId ?? row.label_id ?? '')
    if (!noteId || !labelId) continue
    await db.insert(noteLabelAssignments).values({ noteId, labelId }).onConflictDoNothing()
  }
```

- [ ] **Step 4: Run all export tests**

```
cd apps/mobile && npx jest services/__tests__/export.test.ts --no-coverage
```
Expected: all tests PASS including the new one.

- [ ] **Step 5: Commit**

```
git add apps/mobile/services/export.ts apps/mobile/services/__tests__/export.test.ts
git commit -m "feat(notes): extend export/import to include notes, note_labels, note_label_assignments"
```

---

## Task 9: Supabase Sync Extension

**Files:**
- Modify: `apps/mobile/services/sync.ts`
- Modify: `apps/mobile/services/__tests__/sync.test.ts`

- [ ] **Step 1: Write failing test**

Open `apps/mobile/services/__tests__/sync.test.ts`. Read the existing test to understand the `makeDb` mock structure there, then add at the bottom:

```typescript
describe('pushUserData includes notes', () => {
  it('includes notes, note_labels, note_label_assignments in the upsert payload', async () => {
    const { supabase } = require('../supabase')
    const upsertMock = jest.fn().mockResolvedValue({ error: null })
    ;(supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'user-1' } } })
    ;(supabase.from as jest.Mock).mockReturnValue({ upsert: upsertMock })

    const selectResult = (rows: unknown[]) => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue(rows),
      orderBy: jest.fn().mockResolvedValue(rows),
    })

    const db: any = {
      select: jest.fn()
        .mockReturnValueOnce(selectResult([]))   // focusListings
        .mockReturnValueOnce(selectResult([]))   // savedListings
        .mockReturnValueOnce(selectResult([]))   // savedDecks
        .mockReturnValueOnce(selectResult([]))   // userProgress
        .mockReturnValueOnce(selectResult([]))   // practiceSessions
        .mockReturnValueOnce(selectResult([]))   // userSettings
        .mockReturnValueOnce(selectResult([]))   // notes
        .mockReturnValueOnce(selectResult([]))   // noteLabels
        .mockReturnValueOnce(selectResult([])),  // noteLabelAssignments
    }

    const { pushUserData } = require('../sync')
    await pushUserData(db)

    expect(upsertMock).toHaveBeenCalledTimes(1)
    const payload = upsertMock.mock.calls[0]![0] as Record<string, unknown>
    expect(payload).toHaveProperty('notes')
    expect(payload).toHaveProperty('note_labels')
    expect(payload).toHaveProperty('note_label_assignments')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```
cd apps/mobile && npx jest services/__tests__/sync.test.ts --no-coverage
```
Expected: existing tests PASS, new test FAIL.

- [ ] **Step 3: Update services/sync.ts — imports**

Add to the existing schema imports at the top:

```typescript
import {
  subjects, topics, flashcards, listings, userSettings,
  focusListings, savedListings, savedDecks, userProgress, practiceSessions,
  notes as notesTable, noteLabels, noteLabelAssignments,
} from '../db/schema'
```

- [ ] **Step 4: Update pushUserData**

Replace the `Promise.all` call in `pushUserData`:

```typescript
  const [focus, saved, decks, progress, sessions, settings, noteRows, labelRows, assignRows] = await Promise.all([
    db.select().from(focusListings),
    db.select().from(savedListings),
    db.select().from(savedDecks),
    db.select().from(userProgress),
    db.select().from(practiceSessions),
    db.select().from(userSettings).where(eq(userSettings.id, 1)).limit(1),
    db.select().from(notesTable),
    db.select().from(noteLabels),
    db.select().from(noteLabelAssignments),
  ])

  await supabase.from('user_app_data').upsert({
    user_id: user.id,
    focus_listings: focus,
    saved_listings: saved,
    saved_decks: decks,
    user_progress: progress,
    practice_sessions: sessions,
    settings: settings[0] ?? {},
    notes: noteRows,
    note_labels: labelRows,
    note_label_assignments: assignRows,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })
```

- [ ] **Step 5: Update pullUserData**

Inside the `db.transaction` callback in `pullUserData`, after the existing settings restore block, add:

```typescript
    // Restore notes — wipe and restore
    const remoteNotes: typeof notesTable.$inferInsert[] = data.notes ?? []
    tx.delete(noteLabelAssignments).run()
    tx.delete(notesTable).run()
    for (const row of remoteNotes) {
      tx.insert(notesTable).values(row).onConflictDoNothing().run()
    }

    // Restore note labels
    const remoteLabels: typeof noteLabels.$inferInsert[] = data.note_labels ?? []
    tx.delete(noteLabels).run()
    for (const row of remoteLabels) {
      tx.insert(noteLabels).values(row).onConflictDoNothing().run()
    }

    // Restore note label assignments
    const remoteAssigns: typeof noteLabelAssignments.$inferInsert[] = data.note_label_assignments ?? []
    for (const row of remoteAssigns) {
      tx.insert(noteLabelAssignments).values(row).onConflictDoNothing().run()
    }
```

- [ ] **Step 6: Run all sync tests**

```
cd apps/mobile && npx jest services/__tests__/sync.test.ts --no-coverage
```
Expected: all tests PASS.

- [ ] **Step 7: Run the full test suite**

```
cd apps/mobile && npx jest --no-coverage
```
Expected: all previously passing tests still pass; new tests pass. Note any pre-existing failures — they are not introduced by this PR.

- [ ] **Step 8: Final TypeScript check**

```
cd apps/mobile && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 9: Supabase prerequisite note**

> **MANUAL STEP (outside code):** Before the first sync runs on a device, add three `jsonb` columns to the `user_app_data` table in the Supabase dashboard:
> - `notes jsonb DEFAULT '[]'::jsonb`
> - `note_labels jsonb DEFAULT '[]'::jsonb`
> - `note_label_assignments jsonb DEFAULT '[]'::jsonb`
>
> Run in the Supabase SQL Editor:
> ```sql
> ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS notes jsonb DEFAULT '[]'::jsonb;
> ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS note_labels jsonb DEFAULT '[]'::jsonb;
> ALTER TABLE user_app_data ADD COLUMN IF NOT EXISTS note_label_assignments jsonb DEFAULT '[]'::jsonb;
> ```

- [ ] **Step 10: Commit**

```
git add apps/mobile/services/sync.ts apps/mobile/services/__tests__/sync.test.ts
git commit -m "feat(notes): extend Supabase push/pull to include notes, note_labels, note_label_assignments"
```

---

## Verification After All Tasks

1. Run full test suite: `cd apps/mobile && npx jest --no-coverage` — all tests pass (or same pre-existing failures as before)
2. TypeScript: `npx tsc --noEmit` — no errors
3. Manual device check:
   - Launch app → swipe right from Home → Notes screen slides in from the left
   - Swipe left on Notes → returns to Home
   - Tap + → sub-menu appears → tap "Text note" → editor opens
   - Type title and content → close → note appears in grid
   - Long-press a note → multi-select bar appears
   - Tap a note → editor opens, content pre-filled
   - Change color in bottom toolbar → note card updates color
   - Archive a note via toolbar → note disappears from grid, appears in Archive
   - Trash a note → appears in Trash → "Delete forever" permanently removes it
   - Create a label → assign to note → label chip visible on card
4. Apply the Supabase SQL migration for the three `jsonb` columns
5. Sign in with Google → verify notes sync to `user_app_data`
6. Export data → JSON file contains `notes`, `note_labels`, `note_label_assignments` arrays
