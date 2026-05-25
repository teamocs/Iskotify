# PR 14 — Subject Row Actions: View, Edit, Delete

## Goal

Add three action buttons to each row in the subjects listing page (`/admin/flashcards`): **View Flashcards** (link to subject detail), **Edit** (modal to rename subject and link to exams/scholarships), and **Delete** (with topic + card count confirmation). Editing a subject stores `listing_slugs` on `flashcard_subjects` so the mobile app can filter subjects by exam relevance.

## Architecture

`FlashcardsPage` (server) fetches subjects + all listings and passes both to a new `SubjectsView` client component. `SubjectsView` owns the interactive state (edit modal, delete confirmation) and a local copy of the subjects list so mutations reflect immediately without a full reload. Pattern mirrors `ListingsView` from PR 12C.

**Tech stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR · Vitest (node env) · renderToStaticMarkup

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `supabase/migrations/010_subject_listing_slugs.sql` | Create | Add `listing_slugs text[]` to `flashcard_subjects` |
| `apps/admin/app/api/flashcards/subjects/[id]/route.ts` | Modify | Add PATCH + DELETE handlers |
| `apps/admin/app/api/flashcards/subjects/[id]/__tests__/route.test.ts` | Create | PATCH + DELETE unit tests |
| `apps/admin/components/admin/SubjectsView.tsx` | Create | Client wrapper: edit modal + delete confirm + table |
| `apps/admin/components/admin/__tests__/SubjectsView.test.tsx` | Create | Static render tests |
| `apps/admin/app/admin/flashcards/page.tsx` | Modify | Fetch listings; pass subjects + listings to SubjectsView |
| `apps/admin/app/admin/flashcards/__tests__/page.test.tsx` | Create | Page passes correct props; no direct table render |

---

## Section 1: Database Migration

**`supabase/migrations/010_subject_listing_slugs.sql`**

```sql
ALTER TABLE flashcard_subjects
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';
```

Same type and pattern as `listing_slugs` on `flashcards`. No index needed — queried by mobile app via array overlap (`@>`), volume is small.

---

## Section 2: API — subjects/[id]/route.ts

### PATCH

Request body: `{ name: string, listing_slugs: string[] }`

Validation:
- `name` must be a non-empty string after trim
- `listing_slugs` must be an array of strings (empty array is valid)
- Returns 400 with `{ error: string }` on validation failure
- Returns 404 if subject does not exist
- Returns 200 with updated subject `{ id, name, listing_slugs }` on success

### DELETE

No request body.

- Deletes the subject by id (DB cascade removes all topics + flashcards)
- Returns 404 if subject does not exist
- Returns 204 on success

### Existing GET

Unchanged.

---

## Section 3: SubjectsView Client Component

**`components/admin/SubjectsView.tsx`**

```tsx
'use client'
```

### Props

```ts
interface SubjectRow {
  id: string
  name: string
  listing_slugs: string[]
  topics: { id: string; flashcards: { id: string }[] }[]
  totalCards: number
  overallStatus: string
}

interface ListingOption {
  id: string
  slug: string
  title: string
  provider: string
  type: 'scholarship' | 'exam'
}

interface Props {
  subjects: SubjectRow[]
  listings: ListingOption[]
}
```

### State

```ts
const [subjects, setSubjects] = useState(initialSubjects)
const [editingSubject, setEditingSubject] = useState<SubjectRow | null>(null)
const [deletingSubject, setDeletingSubject] = useState<SubjectRow | null>(null)
const [saving, setSaving] = useState(false)
const [error, setError] = useState('')
// edit form fields
const [editName, setEditName] = useState('')
const [editSlugs, setEditSlugs] = useState<string[]>([])
```

### Edit modal

Opens when `editingSubject` is set. Fields:
- **Subject name** — `<input>` pre-filled with `editingSubject.name`
- **Linked listings** — checkboxes in two groups (**Scholarships** / **Exams**), each showing `title` + `provider`. Pre-checked based on `editingSubject.listing_slugs`.

On save: `PATCH /api/flashcards/subjects/${editingSubject.id}` with `{ name: editName.trim(), listing_slugs: editSlugs }`. On success, update local `subjects` state and close modal.

### Delete confirmation

Inline banner rendered below the subject row when `deletingSubject` is set:

> "Delete **[Name]**? This will permanently remove **X topics** and **Y cards**."

Y is the sum of all flashcard counts across the subject's topics. Confirm button calls `DELETE /api/flashcards/subjects/${deletingSubject.id}`. On success, remove subject from local state.

### Table structure

Desktop table gains two additions:
1. **Listing pills** — rendered below the subject name: small `bg-[#f3f4f6] text-[#6e6e73] text-[10px]` rounded pills showing the listing title for each linked slug. Empty if none.
2. **Actions column** — three buttons per row: **View** (link → `/admin/flashcards/subjects/${id}`), **Edit** (opens modal), **Delete** (opens confirmation).

Mobile cards gain the same listing pills and a row of action buttons below the existing content.

### Error handling

API errors display in a red banner inside the modal (edit) or inside the confirmation banner (delete). Saving state disables buttons to prevent double-submit.

---

## Section 4: FlashcardsPage (server)

**`app/admin/flashcards/page.tsx`**

Add a second fetch:

```ts
const { data: listings } = await db
  .from('listings')
  .select('id, slug, title, provider, type')
  .in('status', ['active', 'upcoming'])
  .order('type')
  .order('title')
```

Only `active` and `upcoming` listings are shown in the multi-select — closed listings are excluded since linking a subject to a closed exam is not useful.

Pass to `SubjectsView`:

```tsx
<SubjectsView subjects={enriched} listings={listings ?? []} />
```

Remove the direct `<table>` and mobile cards renders — they move into `SubjectsView`.

The `enriched` subjects now include `listing_slugs`:

```ts
const enriched = subjects.map(subject => ({
  ...subject,
  topics: (subject.flashcard_topics ?? []) as Topic[],
  totalCards: ...,
  overallStatus: ...,
  listing_slugs: subject.listing_slugs ?? [],
}))
```

---

## Section 5: Testing

### `subjects/[id]/__tests__/route.test.ts`

```
PATCH valid body → 200 with updated subject
PATCH missing name → 400
PATCH empty name → 400
PATCH unknown id → 404
DELETE existing subject → 204
DELETE unknown id → 404
```

### `components/admin/__tests__/SubjectsView.test.tsx`

Static renderToStaticMarkup:
```
renders subject rows with name and topic/card counts
renders listing pills for linked subjects
renders View, Edit, Delete buttons per row
```

### `app/admin/flashcards/__tests__/page.test.tsx`

```
renders SubjectsView (data-testid present)
does NOT render a direct <table> element (moved into SubjectsView)
passes listing data to SubjectsView
```

---

## Responsive Summary

| Element | Mobile | Desktop |
|---------|--------|---------|
| Subject row | Card layout; listing pills below content; action buttons row at bottom | Table row; pills below name; Actions column |
| Edit modal | Full-width bottom sheet feel | Centered modal |
| Delete confirm | Inline below card | Inline below row |
