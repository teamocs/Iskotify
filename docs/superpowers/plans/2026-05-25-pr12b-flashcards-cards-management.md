# PR 12B — Flashcards Cards Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full CRUD cards management page at `/admin/flashcards/subjects/[id]/cards`, grouped by topic in collapsible accordion sections with per-section pagination (load-more), inline edit, and inline delete confirm.

**Architecture:** Server component page fetches subject + topic list on the server (fast initial render). A `SubjectCardsView` client container renders one `TopicCardSection` per topic. Each `TopicCardSection` manages its own cards state, pagination, inline edit/delete, and `AddCardModal` mounting independently. A new `GET /api/flashcards/subjects/[id]/cards` endpoint serves paginated cards per topic. Existing `PATCH /api/flashcards/cards/[id]` and `DELETE /api/flashcards/cards/[id]` routes are reused as-is.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR (`createServerClient` for server pages, `fetch` from client components) · Vitest (node env, `renderToStaticMarkup` for components, `NextRequest` for API routes)

---

### Task 1: GET /api/flashcards/subjects/[id]/cards — paginated cards API

**Files:**
- Create: `apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts`
- Create: `apps/admin/app/api/flashcards/subjects/[id]/cards/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/app/api/flashcards/subjects/[id]/cards/__tests__/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockRange = vi.fn()
const mockOrder = vi.fn(() => ({ range: mockRange }))
const mockEq = vi.fn(() => ({ order: mockOrder }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ select: mockSelect })),
  })),
}))

const PARAMS = Promise.resolve({ id: 'subject-1' })

function makeReq(topicId: string | null, page = '1') {
  const url = new URL('http://localhost/api/flashcards/subjects/subject-1/cards')
  if (topicId) url.searchParams.set('topic_id', topicId)
  if (page !== '1') url.searchParams.set('page', page)
  return new NextRequest(url)
}

describe('GET /api/flashcards/subjects/[id]/cards', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRange.mockClear()
    mockOrder.mockClear()
    mockEq.mockClear()
    mockSelect.mockClear()
  })

  it('returns 400 when topic_id is missing', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeReq(null), { params: PARAMS })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('returns page 1 cards with hasMore true when more cards exist', async () => {
    const cards = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(10)
    expect(body.total).toBe(15)
    expect(body.page).toBe(1)
    expect(body.hasMore).toBe(true)
    expect(mockEq).toHaveBeenCalledWith('topic_id', 'topic-1')
    expect(mockOrder).toHaveBeenCalledWith('created_at')
    expect(mockRange).toHaveBeenCalledWith(0, 9)
  })

  it('returns page 2 with correct offset and hasMore false', async () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({
      id: `c${i}`, question: `Q${i}`, answer: `A${i}`, explanation: '',
    }))
    mockRange.mockResolvedValueOnce({ data: cards, count: 15, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1', '2'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.page).toBe(2)
    expect(body.hasMore).toBe(false)
    expect(mockRange).toHaveBeenCalledWith(10, 19)
  })

  it('returns empty result for topic with no cards', async () => {
    mockRange.mockResolvedValueOnce({ data: [], count: 0, error: null })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-empty'), { params: PARAMS })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.cards).toHaveLength(0)
    expect(body.total).toBe(0)
    expect(body.hasMore).toBe(false)
  })

  it('returns 500 when Supabase query fails', async () => {
    mockRange.mockResolvedValueOnce({ data: null, count: null, error: { message: 'DB error' } })
    const { GET } = await import('../route')
    const res = await GET(makeReq('topic-1'), { params: PARAMS })
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin && npx vitest run "app/api/flashcards/subjects/\[id\]/cards/__tests__/route.test.ts"
```

Expected: 5 failures with "Cannot find module '../route'".

- [ ] **Step 3: Implement the API route**

Create `apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params // Next.js 15.5 requires awaiting params even when unused
  const url = req.nextUrl
  const topic_id = url.searchParams.get('topic_id')

  if (!topic_id) {
    return NextResponse.json({ error: 'topic_id is required' }, { status: 400 })
  }

  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '10')))
  const offset = (page - 1) * limit

  const supabase = createServerClient()
  const { data, count, error } = await supabase
    .from('flashcards')
    .select('id, question, answer, explanation', { count: 'exact' })
    .eq('topic_id', topic_id)
    .order('created_at')
    .range(offset, offset + limit - 1)

  if (error) {
    console.error('[subjects/cards] fetch error:', error)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  const total = count ?? 0
  const cards = data ?? []
  return NextResponse.json({
    cards,
    total,
    page,
    hasMore: offset + cards.length < total,
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/admin && npx vitest run "app/api/flashcards/subjects/\[id\]/cards/__tests__/route.test.ts"
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/api/flashcards/subjects/[id]/cards/route.ts" "apps/admin/app/api/flashcards/subjects/[id]/cards/__tests__/route.test.ts"
git commit -m "feat(admin): GET /api/flashcards/subjects/[id]/cards — paginated cards by topic"
```

---

### Task 2: TopicCardSection — accordion + CRUD

**Files:**
- Create: `apps/admin/components/admin/TopicCardSection.tsx`
- Create: `apps/admin/components/admin/__tests__/TopicCardSection.test.tsx`

> **Context:** `TopicCardSection` is the most complex component in this PR. It manages `isOpen`, `cards[]`, `page`, `hasMore`, `loading`, `editingId`, `deletingId`, `saving`, and `addingCard` state. All fetch calls go to `/api/flashcards/subjects/[subjectId]/cards?topic_id=[topic.id]&page=N`. Edit calls `PATCH /api/flashcards/cards/[id]`. Delete calls `DELETE /api/flashcards/cards/[id]`. Reuses `AddCardModal` (already at `components/admin/AddCardModal.tsx`). `renderToStaticMarkup` tests cover structural render only (hooks run but effects don't fire in static render).

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/components/admin/__tests__/TopicCardSection.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { TopicCardSection } from '../TopicCardSection'

const topic = {
  id: 't1',
  name: 'Philippine History',
  status: 'published' as const,
  cardCount: 7,
}

describe('TopicCardSection', () => {
  it('renders collapsed with topic name and card count in header', () => {
    const html = renderToStaticMarkup(
      React.createElement(TopicCardSection, {
        subjectId: 'sub-1',
        topic,
        defaultOpen: false,
      })
    )
    expect(html).toContain('Philippine History')
    expect(html).toContain('7 cards')
    // Collapsed: no table headers visible
    expect(html).not.toContain('Question')
  })

  it('renders open when defaultOpen is true, showing table headers', () => {
    const html = renderToStaticMarkup(
      React.createElement(TopicCardSection, {
        subjectId: 'sub-1',
        topic,
        defaultOpen: true,
      })
    )
    expect(html).toContain('Philippine History')
    // Open: desktop table headers visible
    expect(html).toContain('Question')
    expect(html).toContain('Answer')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin && npx vitest run "components/admin/__tests__/TopicCardSection.test.tsx"
```

Expected: 2 failures — "Cannot find module '../TopicCardSection'".

- [ ] **Step 3: Implement TopicCardSection**

Create `apps/admin/components/admin/TopicCardSection.tsx`:

```tsx
'use client'

import { useState, useEffect } from 'react'
import { AddCardModal } from './AddCardModal'

interface Card {
  id: string
  question: string
  answer: string
  explanation: string
}

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  topic: Topic
  defaultOpen: boolean
}

const textareaCls =
  'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f] resize-none'

export function TopicCardSection({ subjectId, topic, defaultOpen }: Props) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [cards, setCards] = useState<Card[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  const [localCardCount, setLocalCardCount] = useState(topic.cardCount)
  const [editQ, setEditQ] = useState('')
  const [editA, setEditA] = useState('')
  const [editExp, setEditExp] = useState('')

  async function loadCards(pageNum: number, replace = false) {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/flashcards/subjects/${subjectId}/cards?topic_id=${topic.id}&page=${pageNum}&limit=10`
      )
      if (res.ok) {
        const data = await res.json()
        setCards(prev => (replace ? data.cards : [...prev, ...data.cards]))
        setHasMore(data.hasMore)
        setPage(pageNum)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && cards.length === 0) {
      loadCards(1)
    }
  }, [isOpen])

  function startEdit(card: Card) {
    setEditingId(card.id)
    setEditQ(card.question)
    setEditA(card.answer)
    setEditExp(card.explanation)
    setDeletingId(null)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/flashcards/cards/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: editQ.trim(),
          answer: editA.trim(),
          explanation: editExp.trim(),
        }),
      })
      if (res.ok) {
        setCards(prev =>
          prev.map(c =>
            c.id === editingId
              ? { ...c, question: editQ.trim(), answer: editA.trim(), explanation: editExp.trim() }
              : c
          )
        )
        setEditingId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deletingId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/flashcards/cards/${deletingId}`, { method: 'DELETE' })
      if (res.ok) {
        setCards(prev => prev.filter(c => c.id !== deletingId))
        setLocalCardCount(prev => Math.max(0, prev - 1))
        setDeletingId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
      {/* Accordion header */}
      <div className="flex items-center justify-between px-5 py-4">
        <button
          className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setIsOpen(o => !o)}
        >
          <span
            className={`text-[#aeaeb2] transition-transform text-sm inline-block ${isOpen ? 'rotate-90' : ''}`}
          >
            ›
          </span>
          <span className="font-medium text-[#1d1d1f]">{topic.name}</span>
          <span className="text-xs text-[#6e6e73]">({localCardCount} cards)</span>
        </button>
        {isOpen && (
          <button
            onClick={() => setAddingCard(true)}
            className="text-xs font-medium text-[#800000] hover:text-[#a00000] px-3 py-1 rounded-[980px] border border-[#800000]/20 hover:bg-[#800000]/5 flex-shrink-0"
          >
            + Add Card
          </button>
        )}
      </div>

      {isOpen && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border-t border-[#f3f4f6]">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">
                    Question
                  </th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">
                    Answer
                  </th>
                  <th className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[20%]">
                    Explanation
                  </th>
                  <th className="px-5 py-2 w-[10%]" />
                </tr>
              </thead>
              <tbody>
                {cards.map(card =>
                  editingId === card.id ? (
                    <tr key={card.id} className="border-b border-[#f3f4f6] bg-[#fafafa]">
                      <td className="px-5 py-3">
                        <textarea
                          value={editQ}
                          onChange={e => setEditQ(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <textarea
                          value={editA}
                          onChange={e => setEditA(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <textarea
                          value={editExp}
                          onChange={e => setEditExp(e.target.value)}
                          className={textareaCls}
                          rows={2}
                        />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={saveEdit}
                            disabled={saving || !editQ.trim() || !editA.trim()}
                            className="text-xs font-medium text-[#800000] hover:text-[#a00000] disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3 text-[#1d1d1f]">{card.question}</td>
                      <td className="px-5 py-3 text-[#374151]">{card.answer}</td>
                      <td className="px-5 py-3 text-[#6e6e73]">{card.explanation}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => startEdit(card)}
                            className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => { setDeletingId(card.id); setEditingId(null) }}
                            className="text-xs text-[#6e6e73] hover:text-red-600"
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

          {/* Mobile cards */}
          <div className="md:hidden border-t border-[#f3f4f6] divide-y divide-[#f3f4f6]">
            {cards.map(card => (
              <div key={card.id} className="p-4">
                {editingId === card.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editQ}
                      onChange={e => setEditQ(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Question"
                    />
                    <textarea
                      value={editA}
                      onChange={e => setEditA(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Answer"
                    />
                    <textarea
                      value={editExp}
                      onChange={e => setEditExp(e.target.value)}
                      className={textareaCls}
                      rows={2}
                      placeholder="Explanation (optional)"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={saveEdit}
                        disabled={saving || !editQ.trim() || !editA.trim()}
                        className="text-xs font-medium text-[#800000] disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-[#6e6e73]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-[#1d1d1f] text-sm">{card.question}</p>
                    <p className="text-sm text-[#374151] mt-1">{card.answer}</p>
                    {card.explanation && (
                      <p className="text-xs text-[#6e6e73] mt-1">{card.explanation}</p>
                    )}
                    <div className="flex gap-3 mt-2 justify-end">
                      <button
                        onClick={() => startEdit(card)}
                        className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { setDeletingId(card.id); setEditingId(null) }}
                        className="text-xs text-[#6e6e73] hover:text-red-600"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Delete confirm banner */}
          {deletingId && (
            <div className="px-5 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between gap-4">
              <p className="text-sm text-red-700">Delete this card? This cannot be undone.</p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDelete}
                  disabled={saving}
                  className="text-xs font-semibold text-red-700 hover:text-red-900 disabled:opacity-50"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="text-xs text-[#6e6e73] hover:text-[#1d1d1f]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Loading / empty / load-more */}
          {loading && (
            <p className="px-5 py-4 text-sm text-[#6e6e73] border-t border-[#f3f4f6]">Loading…</p>
          )}
          {!loading && cards.length === 0 && (
            <p className="px-5 py-4 text-sm text-[#6e6e73] border-t border-[#f3f4f6]">
              No cards yet. Use &quot;+ Add Card&quot; to create the first one.
            </p>
          )}
          {!loading && hasMore && (
            <button
              onClick={() => loadCards(page + 1)}
              className="w-full px-5 py-3 text-sm text-[#800000] hover:bg-[#f9fafb] border-t border-[#f3f4f6] text-left transition-colors"
            >
              Load more…
            </button>
          )}
        </>
      )}

      {addingCard && (
        <AddCardModal
          topicId={topic.id}
          topicStatus={topic.status}
          onClose={() => {
            setAddingCard(false)
            setCards([])
            setPage(1)
            loadCards(1, true)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/admin && npx vitest run "components/admin/__tests__/TopicCardSection.test.tsx"
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/components/admin/TopicCardSection.tsx apps/admin/components/admin/__tests__/TopicCardSection.test.tsx
git commit -m "feat(admin): TopicCardSection — accordion, inline edit/delete, load-more, add card"
```

---

### Task 3: SubjectCardsView — accordion container

**Files:**
- Create: `apps/admin/components/admin/SubjectCardsView.tsx`
- Create: `apps/admin/components/admin/__tests__/SubjectCardsView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/admin/components/admin/__tests__/SubjectCardsView.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { SubjectCardsView } from '../SubjectCardsView'

const topics = [
  { id: 't1', name: 'Philippine History', status: 'published' as const, cardCount: 5 },
  { id: 't2', name: 'World Events', status: 'draft' as const, cardCount: 3 },
]

describe('SubjectCardsView', () => {
  it('renders a section for each topic', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectCardsView, {
        subjectId: 'sub-1',
        topics,
        defaultOpenTopicId: undefined,
      })
    )
    expect(html).toContain('Philippine History')
    expect(html).toContain('World Events')
  })

  it('shows empty state when topics array is empty', () => {
    const html = renderToStaticMarkup(
      React.createElement(SubjectCardsView, {
        subjectId: 'sub-1',
        topics: [],
        defaultOpenTopicId: undefined,
      })
    )
    expect(html).toContain('No topics')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/admin && npx vitest run "components/admin/__tests__/SubjectCardsView.test.tsx"
```

Expected: 2 failures — "Cannot find module '../SubjectCardsView'".

- [ ] **Step 3: Implement SubjectCardsView**

Create `apps/admin/components/admin/SubjectCardsView.tsx`:

```tsx
'use client'

import { TopicCardSection } from './TopicCardSection'

interface Topic {
  id: string
  name: string
  status: 'published' | 'draft'
  cardCount: number
}

interface Props {
  subjectId: string
  topics: Topic[]
  defaultOpenTopicId?: string
}

export function SubjectCardsView({ subjectId, topics, defaultOpenTopicId }: Props) {
  if (topics.length === 0) {
    return (
      <div className="text-center py-16 text-[#6e6e73] text-sm">
        No topics yet. Add topics from the subject page first.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {topics.map(topic => (
        <TopicCardSection
          key={topic.id}
          subjectId={subjectId}
          topic={topic}
          defaultOpen={topic.id === defaultOpenTopicId}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/admin && npx vitest run "components/admin/__tests__/SubjectCardsView.test.tsx"
```

Expected: 2 passed.

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
cd apps/admin && npx vitest run
```

Expected: all tests pass (102 total with Tasks 1–3 adding 9 new tests).

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/admin/SubjectCardsView.tsx apps/admin/components/admin/__tests__/SubjectCardsView.test.tsx
git commit -m "feat(admin): SubjectCardsView — accordion container for topic card sections"
```

---

### Task 4: Cards management server page

**Files:**
- Create: `apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx`

> **Context:** This is a server component. It follows the exact same fetch pattern as `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx` — fetch subject name + topics with nested flashcards count. Both `params` and `searchParams` must be awaited (Next.js 15.5). No tests for server pages (they require the full Next.js runtime). Manual verification: navigate to `/admin/flashcards/subjects/[any-id]/cards` and confirm the page loads.

- [ ] **Step 1: Create the server page**

Create `apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx`:

```tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { SubjectCardsView } from '@/components/admin/SubjectCardsView'

export const dynamic = 'force-dynamic'

export default async function SubjectCardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ topic?: string }>
}) {
  const { id } = await params
  const { topic: defaultOpenTopicId } = await searchParams

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
      <Topbar title={`${subject.name} — Cards`} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <Breadcrumb
          items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject.name, href: `/admin/flashcards/subjects/${id}` },
            { label: 'Cards' },
          ]}
        />
        <SubjectCardsView
          subjectId={id}
          topics={topicsWithCount}
          defaultOpenTopicId={defaultOpenTopicId}
        />
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
cd apps/admin && npx vitest run
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/admin/flashcards/subjects/[id]/cards/page.tsx"
git commit -m "feat(admin): /subjects/[id]/cards — cards management server page"
```

---

### Task 5: Add "View Cards →" link to subjects/[id] page

**Files:**
- Modify: `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx`

> **Context:** This page currently renders two layouts: a desktop table (Topic | Cards | Status columns) and mobile cards (full-width `<Link>` per topic). Add a "View Cards →" link to each topic row in both layouts, linking to `/admin/flashcards/subjects/${id}/cards?topic=${topic.id}`. The mobile card's outer element changes from a `<Link>` to a `<div>` to allow two separate navigation targets inside it.

- [ ] **Step 1: Update subjects/[id]/page.tsx**

Replace the full content of `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx` with:

```tsx
// apps/admin/app/admin/flashcards/subjects/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddTopicButton } from '@/components/admin/AddTopicButton'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

function statusBadge(status: string) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

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
    status: string
    flashcards: { id: string }[]
  }>

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

        {topics.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No topics yet. Use the &quot;+ Add Topic&quot; button to create one.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Topic</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Cards</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Status</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {topics.map(topic => (
                    <tr key={topic.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/flashcards/topics/${topic.id}`}
                          className="font-medium text-[#1d1d1f] hover:text-[#800000] transition-colors"
                        >
                          {topic.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[#374151]">{topic.flashcards?.length ?? 0}</td>
                      <td className="px-5 py-3">{statusBadge(topic.status)}</td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/flashcards/subjects/${id}/cards?topic=${topic.id}`}
                          className="text-xs text-[#800000] hover:text-[#a00000] font-medium transition-colors"
                        >
                          View Cards →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {topics.map(topic => (
                <div
                  key={topic.id}
                  className="bg-white border border-[#e5e7eb] rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[#1d1d1f]">{topic.name}</p>
                      <p className="text-xs text-[#6e6e73] mt-0.5">{topic.flashcards?.length ?? 0} cards</p>
                      <div className="mt-1">{statusBadge(topic.status)}</div>
                      <Link
                        href={`/admin/flashcards/subjects/${id}/cards?topic=${topic.id}`}
                        className="inline-block mt-2 text-xs font-medium text-[#800000] hover:text-[#a00000]"
                      >
                        View Cards →
                      </Link>
                    </div>
                    <Link
                      href={`/admin/flashcards/topics/${topic.id}`}
                      className="text-[#aeaeb2] text-lg flex-shrink-0 hover:text-[#1d1d1f] transition-colors"
                      aria-label={`Open ${topic.name} topic`}
                    >
                      ›
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
cd apps/admin && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add "apps/admin/app/admin/flashcards/subjects/[id]/page.tsx"
git commit -m "feat(admin): add View Cards link to each topic row on subjects page"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ New page at `/admin/flashcards/subjects/[id]/cards` — Task 4
- ✅ `GET /api/flashcards/subjects/[id]/cards` with pagination — Task 1
- ✅ `SubjectCardsView` client container — Task 3
- ✅ `TopicCardSection` with accordion, load-more, inline edit, inline delete, add card — Task 2
- ✅ `PATCH` / `DELETE` reuse existing `/api/flashcards/cards/[id]` routes (no changes needed)
- ✅ "View Cards →" link on subjects/[id] page — Task 5
- ✅ Responsive (desktop table + mobile card layout) — both in Task 2
- ✅ Breadcrumb: Subjects › [Subject Name] › Cards — Task 4
- ✅ `defaultOpenTopicId` from `?topic=` URL param — Task 4

**Type consistency check:**
- `Topic` interface (`{ id, name, status, cardCount }`) used consistently across `SubjectCardsView`, `TopicCardSection`, and server page
- `Card` interface (`{ id, question, answer, explanation }`) matches the API response shape
- `loadCards(pageNum, replace?)` signature consistent throughout `TopicCardSection`
