# PR 12B — Flashcards Cards Management Page

## Goal

Add a full CRUD cards management page at `/admin/flashcards/subjects/[id]/cards`, accessible via a "View Cards →" action on each topic row of the subjects detail page. Cards are grouped by topic in collapsible accordion sections with per-section pagination (10 cards, load-more). Inline edit and inline delete confirm — no separate modals.

## Architecture

Server component page fetches subject name + topic list on the server (fast initial render, breadcrumb SEO-friendly). A `SubjectCardsView` client component receives topics as props and renders one `TopicCardSection` per topic. Each section manages its own fetch, pagination, and edit/delete state independently. The `?topic=TOPIC_ID` URL param is read server-side and passed as `defaultOpenTopicId` to pre-expand the relevant section.

**Tech stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR (`createServerClient` on server, `fetch` from client components)

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `app/admin/flashcards/subjects/[id]/cards/page.tsx` | Create | Server component — fetch subject + topics, render `SubjectCardsView` |
| `app/api/flashcards/subjects/[id]/cards/route.ts` | Create | `GET` with pagination (`topic_id`, `page`, `limit`) |
| `components/admin/SubjectCardsView.tsx` | Create | Client accordion container — renders `TopicCardSection` list |
| `components/admin/TopicCardSection.tsx` | Create | Client section — owns cards state, pagination, edit, delete |
| `app/admin/flashcards/subjects/[id]/page.tsx` | Modify | Add "View Cards →" link to each topic row (desktop + mobile) |
| `app/api/flashcards/subjects/[id]/cards/__tests__/route.test.ts` | Create | 5 API tests |
| `components/admin/__tests__/TopicCardSection.test.tsx` | Create | 4 component tests |

---

## API

### `GET /api/flashcards/subjects/[id]/cards`

**Query params:**
- `topic_id` (required) — filter cards to this topic
- `page` (default: `1`) — 1-based page number
- `limit` (default: `10`, max: `50`) — cards per page

**Success response (`200`):**
```json
{
  "cards": [{ "id": "uuid", "question": "...", "answer": "...", "explanation": "..." }],
  "total": 42,
  "page": 1,
  "hasMore": true
}
```

**Error responses:**
- `400` — `topic_id` missing
- `500` — Supabase error

**Implementation:**
```ts
const offset = (page - 1) * limit
supabase
  .from('flashcards')
  .select('id, question, answer, explanation', { count: 'exact' })
  .eq('topic_id', topic_id)
  .order('created_at')
  .range(offset, offset + limit - 1)
```

`hasMore = offset + cards.length < total`

---

## Pages & Components

### Server page: `subjects/[id]/cards/page.tsx`

```tsx
export const dynamic = 'force-dynamic'

// Fetch subject name + all topics with card counts
// Call notFound() if subject missing
// Await searchParams (Next.js 15.5): const { topic } = await searchParams
// Render:
//   <Topbar title={`${subject.name} — Cards`} />
//   <Breadcrumb items={[
//     { label: 'Subjects', href: '/admin/flashcards' },
//     { label: subject.name, href: `/admin/flashcards/subjects/${id}` },
//     { label: 'Cards' }
//   ]} />
//   <SubjectCardsView
//     subjectId={id}
//     topics={topics}
//     defaultOpenTopicId={searchParams.topic}
//   />
```

### `SubjectCardsView` (client)

Props: `{ subjectId: string; topics: { id: string; name: string; status: 'published' | 'draft'; cardCount: number }[]; defaultOpenTopicId?: string }`

Renders a `TopicCardSection` for each topic. No state of its own — pure composition.

Empty state: if `topics.length === 0`, show "No topics yet" message.

### `TopicCardSection` (client)

Props: `{ subjectId: string; topic: { id: string; name: string; status: 'published' | 'draft'; cardCount: number }; defaultOpen: boolean }`

**State:**
```ts
isOpen: boolean           // accordion open/closed
cards: Card[]             // loaded cards
page: number              // current page (1-based)
hasMore: boolean          // more pages available
loading: boolean          // fetch in progress
editingId: string | null  // card being edited inline
deletingId: string | null // card pending delete confirm
saving: boolean           // PATCH/DELETE in flight
```

**Behaviour:**
- First expand → fetch page 1 (`isOpen && cards.length === 0`)
- "Load more" → fetch page N+1, append to `cards[]`
- Edit click → `editingId = card.id`; row renders as 3 textareas (question, answer, explanation) + Save / Cancel
- Save → `PATCH /api/flashcards/cards/[id]`; on success update `cards[]` in place, clear `editingId`
- Delete click → `deletingId = card.id`; confirm banner appears below row
- Confirm delete → `DELETE /api/flashcards/cards/[id]`; on success splice from `cards[]`, clear `deletingId`; decrement local `cardCount`
- Add Card → mount `AddCardModal` (existing component); on close/success: reset `cards[]`, `page=1`, refetch page 1

**Desktop layout (inside open section):**

```
| Question (35%) | Answer (35%) | Explanation (20%) | Actions (10%) |
```

Inline edit row: all three cells become `<textarea>` (auto-resize). Actions cell: `[Save] [Cancel]`.
Delete confirm row: full-width banner `"Delete this card? This cannot be undone."` + `[Yes, delete]` `[Cancel]` buttons.

**Mobile layout (`md:hidden`):**

Card per flashcard:
```
[Question bold]
[Answer text]
[Explanation dimmed, if present]
[Edit button]  [Delete button]  — right-aligned icon buttons
```

Inline edit on mobile: stacked textareas replacing the card content.

**Section header:**
```
▶ Topic Name  (N cards)     [+ Add Card]
```
Chevron rotates on expand. Card count updates when cards are added/deleted.

---

## Subjects/[id] Page Change

Each topic row gains a "View Cards →" action linking to `/admin/flashcards/subjects/${subjectId}/cards?topic=${topic.id}`.

**Desktop table:** new rightmost cell `<Link>View Cards →</Link>` (small, muted style matching existing table links).

**Mobile card:** add a `View Cards →` link below the existing topic name/status info.

---

## Testing

### `route.test.ts` — 5 tests

1. Returns 400 when `topic_id` is missing
2. Returns page 1 cards with correct `hasMore: true` when more exist
3. Returns page 2 cards with correct offset (items 11–20)
4. Returns `{ cards: [], total: 0, hasMore: false }` for empty topic
5. Returns 500 when Supabase query fails

### `TopicCardSection.test.tsx` — 4 tests

1. Renders collapsed by default; accordion header shows topic name + card count
2. Expands when `defaultOpen=true` and immediately shows fetched cards
3. Inline edit: clicking Edit transforms row to form; Save calls PATCH and updates card in list
4. Inline delete: clicking Delete shows confirm banner; confirming calls DELETE and removes card from list

---

## Responsive Summary

| Breakpoint | Cards table | Inline edit |
|-----------|------------|-------------|
| `< md` | Stacked card per flashcard | Stacked textareas |
| `≥ md` | 4-column table | Row → inline textarea row |
