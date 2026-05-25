# PR 13 — Flashcards: Subject Cards Management

## Goal

Consolidate the fragmented flashcard admin navigation into a single cohesive subject page. The subjects/[id] page becomes the full management hub: topics and their cards are managed inline via accordion rows. The dead-end read-only `/topics/[id]` page and the now-redundant `/subjects/[id]/cards` page both redirect to the subject page.

## Architecture

No new components are needed. `TopicCardSection` and `SubjectCardsView` already implement the accordion + inline card management pattern. The change is wiring them into `subjects/[id]/page.tsx` and replacing two pages with redirects.

**Tech stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `app/admin/flashcards/subjects/[id]/page.tsx` | Modify | Replace topics table with SubjectCardsView |
| `app/admin/flashcards/subjects/[id]/cards/page.tsx` | Modify | Redirect to `/admin/flashcards/subjects/${id}` |
| `app/admin/flashcards/topics/[id]/page.tsx` | Modify | Fetch subject_id → redirect to `/admin/flashcards/subjects/${subject_id}` |

---

## Section 1: subjects/[id]/page.tsx

### What changes

Remove the desktop table (`hidden md:block`) and mobile cards list (`md:hidden`) that currently render topic rows. Replace with `<SubjectCardsView subjectId={id} topics={topicsWithCount} />`.

### What stays

- `<Topbar title={subject.name} />`
- Breadcrumb: `Subjects → Subject Name`
- `<AddTopicButton subjectId={id} />`
- Topic count line: `{topics.length} topic{topics.length !== 1 ? 's' : ''}`
- Empty state is now handled by SubjectCardsView itself ("No topics yet. Add topics from the subject page first.")

### Data fetch

No change needed — the page already fetches topics with `flashcards (id)` for card counts and maps to `topicsWithCount`. Pass directly to SubjectCardsView.

### Result

```tsx
return (
  <>
    <Topbar title={subject.name} />
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Breadcrumb items={[
          { label: 'Subjects', href: '/admin/flashcards' },
          { label: subject.name },
        ]} />
        <AddTopicButton subjectId={id} />
      </div>
      <p className="text-sm text-[#6e6e73]">{topics.length} topic{topics.length !== 1 ? 's' : ''}</p>
      <SubjectCardsView subjectId={id} topics={topicsWithCount} />
    </div>
  </>
)
```

Add import: `import { SubjectCardsView } from '@/components/admin/SubjectCardsView'`
Remove imports: `Link` (no longer used after table removal)

---

## Section 2: subjects/[id]/cards/page.tsx

Replace the entire page body with a redirect:

```tsx
import { redirect } from 'next/navigation'

export default async function SubjectCardsRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/flashcards/subjects/${id}`)
}
```

Remove all imports except `redirect`. Keep `export const dynamic = 'force-dynamic'` to prevent caching.

---

## Section 3: topics/[id]/page.tsx

Replace the entire page body with a redirect that first fetches the topic to get its subject_id:

```tsx
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@iskotify/utils'

export const dynamic = 'force-dynamic'

export default async function TopicRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = createServerClient()

  const { data: topic } = await db
    .from('flashcard_topics')
    .select('subject_id')
    .eq('id', id)
    .single()

  if (!topic?.subject_id) notFound()

  redirect(`/admin/flashcards/subjects/${topic.subject_id}`)
}
```

---

## Testing

**`components/admin/__tests__/SubjectCardsView.test.tsx`** — already exists (2 tests). No changes needed.

**`app/admin/flashcards/subjects/[id]/__tests__/page.test.tsx`** (new) — verify the subjects page renders SubjectCardsView and not the old table:

```tsx
// Static render: confirm SubjectCardsView is wired in and old table is gone
// Mock createServerClient, confirm output contains topic names
// Confirm the old desktop table header columns are gone:
//   output should NOT contain "View Cards" link text
//   output should NOT contain the ACTIONS column header
// Note: TopicCardSection renders a <table> internally for cards — do not assert absence of <table>
```

The redirect pages (`subjects/[id]/cards` and `topics/[id]`) have no logic to test beyond TypeScript correctness.

---

## Responsive Behaviour

| Area | Before | After |
|------|--------|-------|
| subjects/[id] desktop | Topics table with "View Cards →" links | TopicCardSection accordions (already responsive) |
| subjects/[id] mobile | Topic cards with separate "View Cards →" links | Same TopicCardSection accordions |
| subjects/[id]/cards | Full management page | Instant redirect to subjects/[id] |
| topics/[id] | Read-only table | Instant redirect to subjects/[id] |
