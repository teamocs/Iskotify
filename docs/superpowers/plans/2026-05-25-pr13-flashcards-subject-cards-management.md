# PR 13 — Flashcards Subject Cards Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the fragmented flashcard admin into a single subject page that manages topics and cards inline, replacing two stale routes with redirects.

**Architecture:** `subjects/[id]/page.tsx` drops its read-only topics table and renders `SubjectCardsView` directly — no new components needed, only wiring. `subjects/[id]/cards/page.tsx` and `topics/[id]/page.tsx` become thin redirect pages that preserve existing bookmarks and links.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR · Vitest (node env) · renderToStaticMarkup

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx` | Modify | Replace topics table with SubjectCardsView |
| `apps/admin/app/admin/flashcards/subjects/[id]/__tests__/page.test.tsx` | Create | Verify SubjectCardsView renders; old table absent |
| `apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx` | Modify | Replace body with redirect to subjects/[id] |
| `apps/admin/app/admin/flashcards/topics/[id]/page.tsx` | Modify | Fetch subject_id → redirect to subjects/[id] |

---

### Task 1: Update subjects/[id]/page.tsx — replace table with SubjectCardsView

**Files:**
- Modify: `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx`
- Create: `apps/admin/app/admin/flashcards/subjects/[id]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/app/admin/flashcards/subjects/[id]/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// --- mocks ---

const mockSingle = vi.fn()
const mockOrder = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'flashcard_subjects'
            ? { single: mockSingle }
            : { order: mockOrder },
      }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
}))

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

vi.mock('@/components/admin/Breadcrumb', () => ({
  Breadcrumb: () => <nav data-testid="breadcrumb" />,
}))

vi.mock('@/components/admin/AddTopicButton', () => ({
  AddTopicButton: () => <button>+ Add Topic</button>,
}))

vi.mock('@/components/admin/SubjectCardsView', () => ({
  SubjectCardsView: ({ topics }: { topics: { name: string }[] }) => (
    <div data-testid="subject-cards-view">
      {topics.map(t => <span key={t.name}>{t.name}</span>)}
    </div>
  ),
}))

// --- tests ---

describe('SubjectDetailPage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders SubjectCardsView with topics', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'sub1', name: 'Mathematics' } })
    mockOrder.mockResolvedValue({
      data: [
        { id: 't1', name: 'Algebra', status: 'published', flashcards: [{ id: 'c1' }, { id: 'c2' }] },
        { id: 't2', name: 'Geometry', status: 'draft', flashcards: [] },
      ],
    })

    const { default: Page } = await import('../page')
    const element = await Page({ params: Promise.resolve({ id: 'sub1' }) })
    const html = renderToStaticMarkup(element as React.ReactElement)

    expect(html).toContain('subject-cards-view')
    expect(html).toContain('Algebra')
    expect(html).toContain('Geometry')
    expect(html).toContain('Mathematics')
    expect(html).toContain('2 topics')
  })

  it('does not render the old View Cards link', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'sub1', name: 'Mathematics' } })
    mockOrder.mockResolvedValue({
      data: [
        { id: 't1', name: 'Algebra', status: 'published', flashcards: [] },
      ],
    })

    const { default: Page } = await import('../page')
    const element = await Page({ params: Promise.resolve({ id: 'sub1' }) })
    const html = renderToStaticMarkup(element as React.ReactElement)

    expect(html).not.toContain('View Cards')
    expect(html).not.toContain('Actions')
  })

  it('calls notFound when subject does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null })
    mockOrder.mockResolvedValue({ data: [] })

    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'nonexistent' }) })
    ).rejects.toThrow('NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```
pnpm --filter admin test app/admin/flashcards/subjects
```

Expected: FAIL — `subject-cards-view` not found in output (old table renders instead).

- [ ] **Step 3: Update subjects/[id]/page.tsx**

Replace the full file content:

```tsx
// apps/admin/app/admin/flashcards/subjects/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddTopicButton } from '@/components/admin/AddTopicButton'
import { SubjectCardsView } from '@/components/admin/SubjectCardsView'

export const dynamic = 'force-dynamic'

export default async function SubjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (!subject) notFound()

  const { data: topicsRaw } = await db
    .from('flashcard_topics')
    .select('id, name, status, flashcards (id)')
    .eq('subject_id', id)
    .order('name')

  const topics = (topicsRaw ?? []) as Array<{
    id: string
    name: string
    status: 'published' | 'draft'
    flashcards: { id: string }[]
  }>

  const topicsWithCount = topics.map(t => ({
    id: t.id,
    name: t.name,
    status: t.status,
    cardCount: t.flashcards?.length ?? 0,
  }))

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
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter admin test app/admin/flashcards/subjects
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full suite to check for regressions**

```
pnpm --filter admin test
```

Expected: all tests pass (130 total).

- [ ] **Step 6: Commit**

```
git add "apps/admin/app/admin/flashcards/subjects/[id]/page.tsx" "apps/admin/app/admin/flashcards/subjects/[id]/__tests__/page.test.tsx"
git commit -m "feat(admin): replace subject topics table with inline card management"
```

---

### Task 2: Redirect subjects/[id]/cards/page.tsx

**Files:**
- Modify: `apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx`

No meaningful logic to test — `redirect()` throws internally and is handled by Next.js. TypeScript compilation confirms correctness.

- [ ] **Step 1: Replace the file content**

```tsx
// apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function SubjectCardsRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/admin/flashcards/subjects/${id}`)
}
```

- [ ] **Step 2: Run the full test suite**

```
pnpm --filter admin test
```

Expected: all tests still pass — no existing test imports this file.

- [ ] **Step 3: Commit**

```
git add "apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx"
git commit -m "feat(admin): redirect subjects/[id]/cards to subjects/[id]"
```

---

### Task 3: Redirect topics/[id]/page.tsx

**Files:**
- Modify: `apps/admin/app/admin/flashcards/topics/[id]/page.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
// apps/admin/app/admin/flashcards/topics/[id]/page.tsx
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

- [ ] **Step 2: Run the full test suite**

```
pnpm --filter admin test
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```
git add "apps/admin/app/admin/flashcards/topics/[id]/page.tsx"
git commit -m "feat(admin): redirect topics/[id] to parent subject page"
```
