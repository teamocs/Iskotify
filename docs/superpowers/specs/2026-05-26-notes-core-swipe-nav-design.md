# Notes Core + Swipe Navigation Design (PR 16a)

## Goal

Add a global notes feature to Iskotify — a Google Keep clone accessible by swiping right from the Home dashboard — with full local persistence, export, and Google sync.

## Architecture

Notes live in three new SQLite tables (`notes`, `note_labels`, `note_label_assignments`). The Notes screen is a non-tab Stack screen at `/notes`, reached by extending `EdgeSwipeNavigator` to handle swipe-right from Home. Sub-screens (editor, labels, archive, trash) are standard Stack pushes on top of `/notes`. Export and Supabase sync follow the existing full-replace pattern used by all other user data tables.

## Tech Stack

Expo Router (Stack navigation), React Native Gesture Handler, Drizzle ORM, Expo SQLite, Supabase (existing `user_app_data` table).

---

## Data Model

### `notes` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID generated on creation |
| `title` | TEXT NOT NULL | Default `''` |
| `content` | TEXT NOT NULL | Plain text for `type='text'`; JSON array of checklist items for `type='checklist'` |
| `type` | TEXT NOT NULL | `'text'` or `'checklist'` |
| `color` | TEXT nullable | `null` = default white; one of: `red`, `pink`, `orange`, `yellow`, `teal`, `green`, `cyan`, `blue`, `cerulean`, `purple`, `gray` |
| `isPinned` | INTEGER NOT NULL | `0` or `1`, default `0` |
| `isArchived` | INTEGER NOT NULL | `0` or `1`, default `0` |
| `isTrashed` | INTEGER NOT NULL | `0` or `1`, default `0` |
| `trashedAt` | INTEGER nullable | Epoch ms when moved to trash; used for 7-day auto-delete |
| `createdAt` | INTEGER NOT NULL | Epoch ms |
| `updatedAt` | INTEGER NOT NULL | Epoch ms |

**Checklist `content` format** (JSON string stored in the `content` column):
```json
[
  { "id": "uuid", "text": "Buy pencils", "isChecked": false },
  { "id": "uuid", "text": "Submit form", "isChecked": true }
]
```

**Indexes:** `notes_updated_at_idx` on `updatedAt`; `notes_archived_idx` on `isArchived`; `notes_trashed_idx` on `isTrashed`.

**`note_label_assignments` index:** `note_label_assignments_note_idx` on `noteId` for efficient per-note label lookups.

### `note_labels` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL UNIQUE | Display name |
| `createdAt` | INTEGER NOT NULL | Epoch ms |

### `note_label_assignments` table

| Column | Type | Notes |
|--------|------|-------|
| `noteId` | TEXT NOT NULL | FK → `notes.id` |
| `labelId` | TEXT NOT NULL | FK → `note_labels.id` |

Composite primary key: `(noteId, labelId)`.

---

## Navigation

`EdgeSwipeNavigator` is extended with one special case: when the current path is `/` (Home tab) and the user swipes **right**, navigate to `/notes`. On the Notes screen, a matching swipe-left gesture calls `router.back()`.

```
[Notes]  ←→  [Home]  ←→  [Practice]  ←→  [Listings]  ←→  [Analytics]  ←→  [Profile]
```

Notes and all its sub-screens are Stack screens in the root `_layout.tsx`. The Notes screen uses `animation: 'slide_from_left'` so it feels like it lives to the left of Home. The tab bar is hidden on all Notes sub-screens (consistent with `/settings`, `/about`, etc.).

**Route tree:**
```
/notes               Notes grid (swipe-accessible from Home)
/notes/[id]          Note editor
/notes/labels        Labels manager
/notes/archive       Archived notes
/notes/trash         Trash
```

---

## Screens

### Notes screen (`/notes`)

- Search bar at top — filters title + content + label names as the user types
- Masonry 2-column grid of note cards with colored backgrounds
- **"Pinned"** section header + pinned cards (shown only when pinned notes exist)
- **"Other notes"** section header below pinned (shown only when both sections are non-empty)
- Note cards display: colored background, title, content preview (2 lines max), label chips
- **FAB** bottom-right: tap → new text note; long-press (or sub-button) → new checklist note
- **Long-press a card** → multi-select mode → bulk actions: pin/unpin, set color, assign label, archive, trash
- **Top-right overflow menu:** Labels, Archive, Trash
- Swipe left → `router.back()` → returns to Home

### Note editor (`/notes/[id]`)

- Full-screen; opened by tapping any note card or from the FAB
- Title text input at top
- **Text notes:** single content text area below title
- **Checklist notes:** list of items below title; each item has a checkbox + text input + drag handle for reordering; tapping a checkbox marks it done; checked items collapse into a "Checked items" disclosure section; `+` button at the bottom of unchecked items to add a new item
- **Auto-save:** debounced 500 ms after every keystroke — no explicit save button
- **Bottom toolbar:** color picker (11 swatches + default clear), label picker (tag sheet), archive button, delete (trash) button
- Back / close gesture → auto-saves and returns to the Notes grid

### Archive (`/notes/archive`)

- Same masonry grid layout, no FAB
- Note card overflow: "Unarchive" (moves back to main grid)

### Trash (`/notes/trash`)

- Same masonry grid layout, no FAB
- **"Empty trash"** button at top
- Note card overflow: "Restore" (untrash), "Delete forever" (permanent delete)
- **Auto-delete:** on app start, any note with `isTrashed = 1` and `trashedAt` older than 7 days is permanently deleted

### Labels (`/notes/labels`)

- "Create label" text input at top with a confirm button
- List of existing labels; each row has inline edit (tap pencil) and delete (tap trash icon)

---

## Note Colors

Stored as string keys; mapped to hex values in the theme:

| Key | Hex |
|-----|-----|
| `red` | `#F28B82` |
| `pink` | `#F6C0C0` |
| `orange` | `#FBBC04` |
| `yellow` | `#FFF475` |
| `teal` | `#CCFF90` |
| `green` | `#E6F4EA` |
| `cyan` | `#D3F0F4` |
| `blue` | `#AECBFA` |
| `cerulean` | `#D4E6F1` |
| `purple` | `#E8CEFC` |
| `gray` | `#E8EAED` |
| `null` (default) | theme card background |

---

## Hooks

### `useNotes()`

Returns notes for the main grid:
- Active notes (`isArchived = 0`, `isTrashed = 0`), ordered: pinned first then by `updatedAt DESC`
- `createNote(type)` — inserts new note, returns id for navigation to editor
- `updateNote(id, patch)` — partial update, sets `updatedAt = Date.now()`
- `deleteNote(id)` — sets `isTrashed = 1`, `trashedAt = Date.now()`
- `archiveNote(id)` — sets `isArchived = 1`
- `unarchiveNote(id)` — sets `isArchived = 0`
- `pinNote(id, pinned)` — sets `isPinned`
- `restoreNote(id)` — sets `isTrashed = 0`, `trashedAt = null`
- `permanentlyDeleteNote(id)` — hard deletes row + its label assignments
- `emptyTrash()` — permanently deletes all trashed notes
- `pruneOldTrashedNotes()` — permanently deletes trashed notes older than 7 days (called on mount)

### `useNoteLabels()`

- `labels` — all label rows ordered by `name ASC`
- `assignmentsForNote(noteId)` — returns label ids assigned to a note
- `createLabel(name)` — inserts new label
- `renameLabel(id, name)` — updates label name
- `deleteLabel(id)` — deletes label + all its assignments
- `assignLabel(noteId, labelId)` — inserts assignment (ignore if exists)
- `unassignLabel(noteId, labelId)` — deletes assignment

---

## File Structure

### New files

| Path | Responsibility |
|------|---------------|
| `app/notes.tsx` | Notes grid screen |
| `app/notes/[id].tsx` | Note editor screen |
| `app/notes/labels.tsx` | Labels manager screen |
| `app/notes/archive.tsx` | Archive screen |
| `app/notes/trash.tsx` | Trash screen |
| `hooks/useNotes.ts` | Notes CRUD + queries |
| `hooks/useNoteLabels.ts` | Labels CRUD + assignments |

### Modified files

| Path | Change |
|------|--------|
| `db/schema.ts` | Add `notes`, `note_labels`, `note_label_assignments` tables |
| `db/client.ts` | Add 7 migration SQL statements (3 CREATE TABLE + 4 CREATE INDEX) |
| `components/EdgeSwipeNavigator.tsx` | Handle swipe-right from `/` → `/notes`; handle swipe-left from `/notes` → back |
| `app/_layout.tsx` | Add `/notes` route group to root Stack with `slide_from_left` animation |
| `services/export.ts` | Add `notes`, `note_labels`, `note_label_assignments` to export/import |
| `services/sync.ts` | Add same three arrays to Supabase `user_app_data` push/pull |

---

## Export & Google Sync

### Export JSON additions

```json
{
  "notes": [
    { "id": "...", "title": "...", "content": "...", "type": "text", "color": null, "isPinned": 0, "isArchived": 0, "isTrashed": 0, "trashedAt": null, "createdAt": 1234567890, "updatedAt": 1234567890 }
  ],
  "note_labels": [
    { "id": "...", "name": "UPCAT Prep", "createdAt": 1234567890 }
  ],
  "note_label_assignments": [
    { "noteId": "...", "labelId": "..." }
  ]
}
```

Import: delete all rows in the three tables, then insert from file (same pattern as `focus_listings`, `saved_decks`, etc.).

### Supabase sync

Three new JSON columns added to `user_app_data`: `notes`, `note_labels`, `note_label_assignments`.

- **Push:** serialize all three tables to JSON, upsert into `user_app_data` on `user_id`
- **Pull:** deserialize, wipe local tables, insert from server

> **Prerequisite:** The `user_app_data` table in Supabase must have `notes`, `note_labels`, and `note_label_assignments` columns (type `jsonb` or `text`) added via the Supabase dashboard before the first sync runs.

---

## Out of Scope (future PRs)

- **PR 16b:** Per-note reminder dates, push notifications, home calendar strip integration
- **PR 16c:** Notes as context for Kuya Baw LLM chat
