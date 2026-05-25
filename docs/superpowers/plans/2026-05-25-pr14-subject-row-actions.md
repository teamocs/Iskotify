# PR 14 — Subject Row Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add View, Edit, and Delete action buttons to each row in the subjects listing page, with an edit modal that supports renaming a subject and linking it to relevant exams/scholarships.

**Architecture:** A `listing_slugs text[]` column is added to `flashcard_subjects`. The subjects listing page converts from a pure server component to a thin data-fetcher that passes subjects + listings to a new `SubjectsView` client component — same pattern as `ListingsView` from PR 12C. `SubjectsView` owns the edit modal and delete confirmation state.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR · Vitest (node env) · renderToStaticMarkup

---

## File Map

| File | Status | Change |
|------|--------|--------|
| `supabase/migrations/010_subject_listing_slugs.sql` | Create | Add `listing_slugs text[]` to `flashcard_subjects` |
| `apps/admin/app/api/flashcards/subjects/[id]/route.ts` | Modify | Add PATCH + DELETE handlers |
| `apps/admin/app/api/flashcards/subjects/[id]/__tests__/route.test.ts` | Create | 6 tests for PATCH + DELETE |
| `apps/admin/components/admin/SubjectsView.tsx` | Create | Client wrapper: table + edit modal + delete confirm |
| `apps/admin/components/admin/__tests__/SubjectsView.test.tsx` | Create | 4 static render tests |
| `apps/admin/app/admin/flashcards/page.tsx` | Modify | Fetch listings; pass to SubjectsView; remove direct table |
| `apps/admin/app/admin/flashcards/__tests__/page.test.tsx` | Create | 3 tests: SubjectsView renders, no direct table, listings passed |

---

### Task 1: DB Migration — add listing_slugs to flashcard_subjects

**Files:**
- Create: `supabase/migrations/010_subject_listing_slugs.sql`

No test needed — the migration is applied to Supabase directly and the API tests mock the DB entirely.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/010_subject_listing_slugs.sql
ALTER TABLE flashcard_subjects
  ADD COLUMN listing_slugs text[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Apply the migration to Supabase**

In the Supabase dashboard → SQL Editor, run the migration SQL. Or via CLI if available:

```
supabase db push
```

Verify: open the `flashcard_subjects` table in the Supabase Table Editor and confirm `listing_slugs` column is present with default `{}`.

- [ ] **Step 3: Commit**

```
git add supabase/migrations/010_subject_listing_slugs.sql
git commit -m "feat(db): add listing_slugs to flashcard_subjects"
```

---

### Task 2: PATCH + DELETE API — subjects/[id]/route.ts

**Files:**
- Modify: `apps/admin/app/api/flashcards/subjects/[id]/route.ts`
- Create: `apps/admin/app/api/flashcards/subjects/[id]/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/subjects/[id]/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockPatchSingle = vi.fn()
const mockDeleteSingle = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: (_table: string) => ({
      update: (_data: object) => ({
        eq: (_col: string, _val: string) => ({
          select: (_cols: string) => ({ single: mockPatchSingle }),
        }),
      }),
      delete: () => ({
        eq: (_col: string, _val: string) => ({
          select: (_cols: string) => ({ single: mockDeleteSingle }),
        }),
      }),
    }),
  })),
}))

function patchReq(id: string, body: object) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function deleteReq(id: string) {
  return new NextRequest(`http://localhost/api/flashcards/subjects/${id}`, {
    method: 'DELETE',
  })
}

describe('PATCH /api/flashcards/subjects/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockPatchSingle.mockClear()
  })

  it('returns 400 when name is missing', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: '   ', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when listing_slugs is not an array', async () => {
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('sub-1', { name: 'Math', listing_slugs: 'not-array' }), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when subject does not exist', async () => {
    mockPatchSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const { PATCH } = await import('../route')
    const res = await PATCH(patchReq('nonexistent', { name: 'Math', listing_slugs: [] }), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 with updated subject on success', async () => {
    mockPatchSingle.mockResolvedValue({
      data: { id: 'sub-1', name: 'Mathematics', listing_slugs: ['dost-sei'] },
      error: null,
    })
    const { PATCH } = await import('../route')
    const res = await PATCH(
      patchReq('sub-1', { name: 'Mathematics', listing_slugs: ['dost-sei'] }),
      { params: Promise.resolve({ id: 'sub-1' }) }
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe('Mathematics')
    expect(body.listing_slugs).toEqual(['dost-sei'])
  })
})

describe('DELETE /api/flashcards/subjects/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockDeleteSingle.mockClear()
  })

  it('returns 404 when subject does not exist', async () => {
    mockDeleteSingle.mockResolvedValue({ data: null, error: { message: 'Not found' } })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('nonexistent'), {
      params: Promise.resolve({ id: 'nonexistent' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 204 on successful delete', async () => {
    mockDeleteSingle.mockResolvedValue({ data: { id: 'sub-1' }, error: null })
    const { DELETE } = await import('../route')
    const res = await DELETE(deleteReq('sub-1'), {
      params: Promise.resolve({ id: 'sub-1' }),
    })
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter admin test app/api/flashcards/subjects
```

Expected: FAIL — `PATCH` and `DELETE` not exported from route.

- [ ] **Step 3: Implement PATCH + DELETE in route.ts**

Replace the full file:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { name, listing_slugs } = body

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!Array.isArray(listing_slugs)) {
    return NextResponse.json({ error: 'listing_slugs must be an array' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .update({ name: name.trim(), listing_slugs })
    .eq('id', id)
    .select('id, name, listing_slugs')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('flashcard_subjects')
    .delete()
    .eq('id', id)
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter admin test app/api/flashcards/subjects
```

Expected: 7 tests PASS (1 existing GET test + 6 new).

- [ ] **Step 5: Run full suite to check for regressions**

```
pnpm --filter admin test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add "apps/admin/app/api/flashcards/subjects/[id]/route.ts" "apps/admin/app/api/flashcards/subjects/[id]/__tests__/route.test.ts"
git commit -m "feat(admin): PATCH + DELETE handlers for flashcard subjects"
```

---

### Task 3: SubjectsView client component

**Files:**
- Create: `apps/admin/components/admin/SubjectsView.tsx`
- Create: `apps/admin/components/admin/__tests__/SubjectsView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/components/admin/__tests__/SubjectsView.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { SubjectsView } from '../SubjectsView'

const listings = [
  { id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' as const },
  { id: 'l2', slug: 'cse', title: 'CSE', provider: 'CSC', type: 'exam' as const },
]

const subjects = [
  {
    id: 'sub1',
    name: 'Mathematics',
    listing_slugs: ['dost-sei'],
    topics: [{ id: 't1', flashcards: [{ id: 'c1' }, { id: 'c2' }] }],
    totalCards: 2,
    overallStatus: 'published',
  },
  {
    id: 'sub2',
    name: 'Science',
    listing_slugs: [],
    topics: [],
    totalCards: 0,
    overallStatus: 'draft',
  },
]

describe('SubjectsView', () => {
  it('renders a row for each subject', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('Mathematics')
    expect(html).toContain('Science')
  })

  it('renders listing pills for linked subjects', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('DOST-SEI')
  })

  it('renders View, Edit, Delete buttons for each subject', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects, listings })
    )
    expect(html).toContain('View')
    expect(html).toContain('Edit')
    expect(html).toContain('Delete')
  })

  it('renders empty state when subjects array is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectsView, { subjects: [], listings })
    )
    expect(html).toContain('No subjects yet')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter admin test components/admin/__tests__/SubjectsView
```

Expected: FAIL — `SubjectsView` not found.

- [ ] **Step 3: Create SubjectsView.tsx**

Create `apps/admin/components/admin/SubjectsView.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'

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

function StatusBadge({ status }: { status: string }) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

function ListingPills({ slugs, listings }: { slugs: string[]; listings: ListingOption[] }) {
  if (slugs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {slugs.map(slug => {
        const listing = listings.find(l => l.slug === slug)
        return listing ? (
          <span key={slug} className="px-1.5 py-0.5 rounded text-[10px] bg-[#f3f4f6] text-[#6e6e73]">
            {listing.title}
          </span>
        ) : null
      })}
    </div>
  )
}

export function SubjectsView({ subjects: initialSubjects, listings }: Props) {
  const [subjects, setSubjects] = useState(initialSubjects)
  const [editingSubject, setEditingSubject] = useState<SubjectRow | null>(null)
  const [deletingSubject, setDeletingSubject] = useState<SubjectRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [editName, setEditName] = useState('')
  const [editSlugs, setEditSlugs] = useState<string[]>([])

  const scholarships = listings.filter(l => l.type === 'scholarship')
  const exams = listings.filter(l => l.type === 'exam')

  function startEdit(subject: SubjectRow) {
    setEditingSubject(subject)
    setEditName(subject.name)
    setEditSlugs(subject.listing_slugs)
    setDeletingSubject(null)
    setError('')
  }

  function startDelete(subject: SubjectRow) {
    setDeletingSubject(subject)
    setEditingSubject(null)
    setError('')
  }

  function toggleSlug(slug: string) {
    setEditSlugs(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
  }

  async function saveEdit() {
    if (!editingSubject) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/flashcards/subjects/${editingSubject.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim(), listing_slugs: editSlugs }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      const updated = await res.json()
      setSubjects(prev =>
        prev.map(s =>
          s.id === updated.id
            ? { ...s, name: updated.name, listing_slugs: updated.listing_slugs }
            : s
        )
      )
      setEditingSubject(null)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deletingSubject) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/flashcards/subjects/${deletingSubject.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      setSubjects(prev => prev.filter(s => s.id !== deletingSubject.id))
      setDeletingSubject(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div data-testid="subjects-view" className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[#6e6e73]">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</p>
        <div className="flex gap-2">
          <Link
            href="/admin/flashcards/new"
            className="px-3 py-1.5 text-xs font-semibold border border-[#d1d5db] rounded-lg text-[#6e6e73] hover:bg-[#f5f5f7] transition-colors"
          >
            + Add manually
          </Link>
          <Link
            href="/admin/flashcards/upload"
            className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
          >
            Upload PDF
          </Link>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="text-center py-16 text-[#6e6e73] text-sm">
          No subjects yet. Upload a PDF or add cards manually.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Subject</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topics</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map(subject => (
                  <React.Fragment key={subject.id}>
                    <tr className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3">
                        <p className="font-medium text-[#1d1d1f]">{subject.name}</p>
                        <ListingPills slugs={subject.listing_slugs} listings={listings} />
                      </td>
                      <td className="px-5 py-3 text-[#374151]">{subject.topics.length}</td>
                      <td className="px-5 py-3 text-[#374151]">{subject.totalCards}</td>
                      <td className="px-5 py-3"><StatusBadge status={subject.overallStatus} /></td>
                      <td className="px-5 py-3">
                        <div className="flex gap-3">
                          <Link
                            href={`/admin/flashcards/subjects/${subject.id}`}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            View
                          </Link>
                          <button
                            onClick={() => startEdit(subject)}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => startDelete(subject)}
                            className="text-xs text-[#6e6e73] hover:text-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    {deletingSubject?.id === subject.id && (
                      <tr className="border-b border-[#f3f4f6]">
                        <td colSpan={5} className="px-5 py-3 bg-red-50 border-t border-red-100">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-sm text-red-700">
                              Delete <strong>{subject.name}</strong>? This will permanently remove{' '}
                              <strong>{subject.topics.length} topic{subject.topics.length !== 1 ? 's' : ''}</strong> and{' '}
                              <strong>{subject.totalCards} card{subject.totalCards !== 1 ? 's' : ''}</strong>.
                            </p>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              {error && <p className="text-xs text-red-600">{error}</p>}
                              <button
                                onClick={confirmDelete}
                                disabled={saving}
                                className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                              >
                                Yes, delete
                              </button>
                              <button
                                onClick={() => { setDeletingSubject(null); setError('') }}
                                className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {subjects.map(subject => (
              <div key={subject.id} className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
                <p className="font-medium text-[#1d1d1f]">{subject.name}</p>
                <p className="text-xs text-[#6e6e73] mt-0.5">
                  {subject.topics.length} topics · {subject.totalCards} cards
                </p>
                <ListingPills slugs={subject.listing_slugs} listings={listings} />
                <div className="mt-1"><StatusBadge status={subject.overallStatus} /></div>
                <div className="flex gap-3 mt-3 pt-3 border-t border-[#f3f4f6]">
                  <Link
                    href={`/admin/flashcards/subjects/${subject.id}`}
                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => startEdit(subject)}
                    className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => startDelete(subject)}
                    className="text-xs text-[#6e6e73] hover:text-red-600"
                  >
                    Delete
                  </button>
                </div>
                {deletingSubject?.id === subject.id && (
                  <div className="mt-3 pt-3 border-t border-red-100 bg-red-50 -mx-4 -mb-4 px-4 pb-4 rounded-b-2xl">
                    <p className="text-sm text-red-700 mb-2">
                      Delete <strong>{subject.name}</strong>? This will permanently remove{' '}
                      <strong>{subject.topics.length} topic{subject.topics.length !== 1 ? 's' : ''}</strong> and{' '}
                      <strong>{subject.totalCards} card{subject.totalCards !== 1 ? 's' : ''}</strong>.
                    </p>
                    {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
                    <div className="flex gap-3">
                      <button
                        onClick={confirmDelete}
                        disabled={saving}
                        className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                      >
                        Yes, delete
                      </button>
                      <button
                        onClick={() => { setDeletingSubject(null); setError('') }}
                        className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Edit modal */}
      {editingSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#1d1d1f]">Edit Subject</h2>

            <div className="space-y-1">
              <label className="text-xs font-medium text-[#6e6e73]">Subject name</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]"
              />
            </div>

            {scholarships.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#6e6e73]">Scholarships</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {scholarships.map(l => (
                    <label key={l.slug} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSlugs.includes(l.slug)}
                        onChange={() => toggleSlug(l.slug)}
                        className="accent-[#800000]"
                      />
                      <span className="text-sm text-[#1d1d1f]">{l.title}</span>
                      {l.provider && <span className="text-xs text-[#6e6e73]">· {l.provider}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {exams.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-[#6e6e73]">Exams</p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {exams.map(l => (
                    <label key={l.slug} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editSlugs.includes(l.slug)}
                        onChange={() => toggleSlug(l.slug)}
                        className="accent-[#800000]"
                      />
                      <span className="text-sm text-[#1d1d1f]">{l.title}</span>
                      {l.provider && <span className="text-xs text-[#6e6e73]">· {l.provider}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <p className="bg-red-50 rounded-[10px] px-3 py-2 text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setEditingSubject(null); setError('') }}
                className="text-sm text-[#6e6e73] hover:text-[#1d1d1f] px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={saving || !editName.trim()}
                className="px-4 py-1.5 text-sm font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter admin test components/admin/__tests__/SubjectsView
```

Expected: 4 tests PASS.

- [ ] **Step 5: Run full suite to check for regressions**

```
pnpm --filter admin test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```
git add "apps/admin/components/admin/SubjectsView.tsx" "apps/admin/components/admin/__tests__/SubjectsView.test.tsx"
git commit -m "feat(admin): SubjectsView client component with edit modal and delete confirm"
```

---

### Task 4: Update FlashcardsPage to use SubjectsView

**Files:**
- Modify: `apps/admin/app/admin/flashcards/page.tsx`
- Create: `apps/admin/app/admin/flashcards/__tests__/page.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/admin/flashcards/__tests__/page.test.tsx`:

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// --- mocks ---

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: (_cols: string) => {
        if (table === 'flashcard_subjects') {
          return {
            order: () => ({
              data: [
                {
                  id: 'sub1',
                  name: 'Mathematics',
                  listing_slugs: [],
                  flashcard_topics: [
                    { id: 't1', status: 'published', flashcards: [{ id: 'c1' }] },
                  ],
                },
              ],
              error: null,
            }),
          }
        }
        // listings
        return {
          in: () => ({
            order: () => ({
              order: () => ({
                data: [
                  { id: 'l1', slug: 'dost-sei', title: 'DOST-SEI', provider: 'DOST', type: 'scholarship' },
                ],
                error: null,
              }),
            }),
          }),
        }
      },
    }),
  }),
}))

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

vi.mock('@/components/admin/SubjectsView', () => ({
  SubjectsView: ({ subjects, listings }: { subjects: { name: string }[]; listings: { slug: string }[] }) => (
    <div data-testid="subjects-view">
      {subjects.map(s => <span key={s.name}>{s.name}</span>)}
      {listings.map(l => <span key={l.slug}>{l.slug}</span>)}
    </div>
  ),
}))

// --- tests ---

describe('FlashcardsPage', () => {
  beforeEach(() => vi.resetModules())

  it('renders SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('subjects-view')
  })

  it('passes subjects data to SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('Mathematics')
  })

  it('passes listings data to SubjectsView', async () => {
    const { default: Page } = await import('../page')
    const element = await Page()
    const html = renderToStaticMarkup(element as React.ReactElement)
    expect(html).toContain('dost-sei')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm --filter admin test app/admin/flashcards/__tests__/page
```

Expected: FAIL — `SubjectsView` not imported by page yet.

- [ ] **Step 3: Update flashcards/page.tsx**

Replace the full file:

```tsx
// apps/admin/app/admin/flashcards/page.tsx
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { SubjectsView } from '@/components/admin/SubjectsView'

export const dynamic = 'force-dynamic'

type Topic = {
  id: string
  name: string
  status: string
  flashcards: { id: string; status: string }[]
}

export default async function FlashcardsPage() {
  const db = createServerClient()

  const { data: subjectsRaw } = await db
    .from('flashcard_subjects')
    .select(`
      id,
      name,
      listing_slugs,
      flashcard_topics (
        id,
        name,
        status,
        flashcards (id, status)
      )
    `)
    .order('name')

  const { data: listingsRaw } = await db
    .from('listings')
    .select('id, slug, title, provider, type')
    .in('status', ['active', 'upcoming'])
    .order('type')
    .order('title')

  const subjects = (subjectsRaw ?? []).map(subject => {
    const topics = (subject.flashcard_topics ?? []) as Topic[]
    const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
    const overallStatus = topics.some(t => t.status === 'published') ? 'published' : 'draft'
    return {
      id: subject.id,
      name: subject.name,
      listing_slugs: (subject.listing_slugs as string[]) ?? [],
      topics,
      totalCards,
      overallStatus,
    }
  })

  const listings = (listingsRaw ?? []) as {
    id: string
    slug: string
    title: string
    provider: string
    type: 'scholarship' | 'exam'
  }[]

  return (
    <>
      <Topbar title="Knowledge Base" />
      <SubjectsView subjects={subjects} listings={listings} />
    </>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm --filter admin test app/admin/flashcards/__tests__/page
```

Expected: 3 tests PASS.

- [ ] **Step 5: Run full suite to check for regressions**

```
pnpm --filter admin test
```

Expected: all tests pass (141 total: 135 existing + 6 API tests + 4 SubjectsView tests + 3 page tests — minus any replaced tests).

- [ ] **Step 6: Commit**

```
git add "apps/admin/app/admin/flashcards/page.tsx" "apps/admin/app/admin/flashcards/__tests__/page.test.tsx"
git commit -m "feat(admin): subjects listing uses SubjectsView with row actions"
```
