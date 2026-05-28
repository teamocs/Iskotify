# PR 12A — Admin Responsive + Drill-Down + View/Add Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Iskotify admin console usable on mobile (drawer sidebar, responsive grids, table-to-card pattern) and add drill-down navigation for flashcards (subject → topic → card) with in-context add modals.

**Architecture:** Extract `SidebarContent` from `Sidebar.tsx` so both the desktop sidebar and a new `MobileSidebar` drawer share the same nav. A new `AdminShell` client component holds drawer state and provides it via `AdminDrawerContext`, replacing the hard-coded `flex h-screen` in `layout.tsx`. Drill-down is handled by two new server-component pages (`subjects/[id]`, `topics/[id]`) that render `AddTopicButton` / `AddCardButton` client components which own their own open state and modal.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind CSS 3.4 · Supabase SSR (`createServerClient` from `@iskotify/utils`) · Vitest (node env, `renderToStaticMarkup` for component tests, `NextRequest` for API tests)

**Working directory:** `apps/admin`

---

## File Map

**New files to create:**
- `components/admin/SidebarContent.tsx` — brand header + nav + footer, used by both sidebars
- `components/admin/MobileSidebar.tsx` — drawer overlay, `md:hidden`, wraps `SidebarContent`
- `components/admin/AdminShell.tsx` — client wrapper: provides `AdminDrawerContext`, renders both sidebars + children
- `contexts/AdminDrawerContext.tsx` — `{ openDrawer: () => void }` context
- `components/admin/Breadcrumb.tsx` — `[{ label, href? }]` → `Subjects › Math › Algebra`
- `components/admin/AddTopicButton.tsx` — client button + modal state wrapper
- `components/admin/AddTopicModal.tsx` — client modal, POSTs to `/api/flashcards/topics`
- `components/admin/AddCardButton.tsx` — client button + modal state wrapper
- `components/admin/AddCardModal.tsx` — client modal, POSTs to `/api/flashcards/cards`
- `app/admin/flashcards/subjects/[id]/page.tsx` — server component: lists topics in a subject
- `app/admin/flashcards/topics/[id]/page.tsx` — server component: lists cards in a topic
- `app/api/flashcards/topics/route.ts` — `POST` only (new route file, GET not needed)
- `components/admin/__tests__/SidebarContent.test.tsx`
- `components/admin/__tests__/Breadcrumb.test.tsx`
- `components/admin/__tests__/AddTopicModal.test.tsx`
- `components/admin/__tests__/AddCardModal.test.tsx`
- `app/api/flashcards/topics/__tests__/route.test.ts`
- `app/api/flashcards/cards/__tests__/route.test.ts`

**Existing files to modify:**
- `components/admin/Sidebar.tsx` — thin desktop-only wrapper over `SidebarContent`
- `components/admin/Topbar.tsx` — add `'use client'`, consume `AdminDrawerContext`, render hamburger
- `app/admin/layout.tsx` — replace shell div with `<AdminShell>`
- `app/admin/listings/page.tsx` — `grid-cols-4` → `grid-cols-2 md:grid-cols-4`, `p-6` → `p-3 sm:p-4 md:p-6`
- `app/admin/sync/page.tsx` — `p-6` → `p-3 sm:p-4 md:p-6`
- `components/admin/ListingTable.tsx` — add `md:hidden` mobile card tree
- `app/admin/flashcards/page.tsx` — add `Link` drill-down, mobile card tree, responsive padding
- `app/api/flashcards/cards/route.ts` — add `POST` handler (keep existing `GET` unchanged)

---

## Task 1: SidebarContent + AdminDrawerContext (extract shared nav)

**Files:**
- Create: `apps/admin/components/admin/SidebarContent.tsx`
- Create: `apps/admin/contexts/AdminDrawerContext.tsx`
- Create: `apps/admin/components/admin/__tests__/SidebarContent.test.tsx`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/components/admin/__tests__/SidebarContent.test.tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/flashcards',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => ({ auth: { signOut: vi.fn() } }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, className, onClick }: { href: string; children: React.ReactNode; className?: string; onClick?: () => void }) =>
    React.createElement('a', { href, className, onClick }, children),
}))

import { SidebarContent } from '../SidebarContent'

describe('SidebarContent', () => {
  it('renders all three nav sections', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('LISTINGS')
    expect(html).toContain('SYNC')
    expect(html).toContain('FLASHCARDS')
  })

  it('renders user email', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('admin@test.com')
  })

  it('highlights the active route with bg-white/10', () => {
    // pathname is '/admin/flashcards' (mocked above) → Subjects link is active
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('bg-white/10')
  })

  it('renders Iskotify brand', () => {
    const html = renderToStaticMarkup(
      React.createElement(SidebarContent, { userEmail: 'admin@test.com' })
    )
    expect(html).toContain('Iskotify')
    expect(html).toContain('Admin Console')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/admin && pnpm exec vitest run components/admin/__tests__/SidebarContent.test.tsx
```
Expected: FAIL — `SidebarContent` does not exist yet.

- [ ] **Step 3: Create `contexts/AdminDrawerContext.tsx`**

```tsx
// apps/admin/contexts/AdminDrawerContext.tsx
'use client'

import { createContext, useContext } from 'react'

interface AdminDrawerContextValue {
  openDrawer: () => void
}

export const AdminDrawerContext = createContext<AdminDrawerContextValue>({
  openDrawer: () => {},
})

export function useAdminDrawer() {
  return useContext(AdminDrawerContext)
}
```

- [ ] **Step 4: Create `SidebarContent.tsx`** (extract from `Sidebar.tsx`)

```tsx
// apps/admin/components/admin/SidebarContent.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const NAV: { section: string; items: { href: string; icon: string; label: string }[] }[] = [
  {
    section: 'LISTINGS',
    items: [
      { href: '/admin/listings', icon: '📋', label: 'All Listings' },
      { href: '/admin/listings?type=scholarship', icon: '🎓', label: 'Scholarships' },
      { href: '/admin/listings?type=exam', icon: '📝', label: 'Exams' },
    ],
  },
  {
    section: 'SYNC',
    items: [{ href: '/admin/sync', icon: '📄', label: 'Sync Logs' }],
  },
  {
    section: 'FLASHCARDS',
    items: [
      { href: '/admin/flashcards', icon: '🃏', label: 'Subjects' },
      { href: '/admin/flashcards/upload', icon: '📚', label: 'Upload PDF' },
    ],
  },
]

interface Props {
  userEmail: string
  onItemClick?: () => void
}

export function SidebarContent({ userEmail, onItemClick }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <>
      <div className="px-4 py-5 border-b border-white/[0.07]">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full bg-[#800000] shadow-[0_0_8px_rgba(128,0,0,0.6)]" />
          <span className="font-heading font-extrabold text-white text-[1.05rem] tracking-tight">Iskotify</span>
        </div>
        <p className="text-[10px] text-white/30 font-medium tracking-widest uppercase pl-0.5">Admin Console</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ section, items }) => (
          <div key={section} className="px-2 py-2 border-b border-white/[0.05]">
            <p className="text-[9px] font-semibold tracking-[0.1em] uppercase text-white/25 px-2 mb-1">{section}</p>
            {items.map(({ href, icon, label }) => {
              const active = pathname === href || pathname.startsWith(href + '?')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onItemClick}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-colors text-sm ${
                    active
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-white/70 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="text-base w-5 text-center">{icon}</span>
                  <span className="flex-1">{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/[0.07]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-[#800000] flex items-center justify-center text-white text-[10px] font-bold font-heading flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-white/80 font-medium truncate">{userEmail}</p>
            <p className="text-[9px] text-white/35">Super Admin</p>
          </div>
          <button
            onClick={handleSignOut}
            className="text-white/30 hover:text-white/70 text-xs transition-colors"
            title="Sign out"
          >
            ↩
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```
cd apps/admin && pnpm exec vitest run components/admin/__tests__/SidebarContent.test.tsx
```
Expected: 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/contexts/AdminDrawerContext.tsx apps/admin/components/admin/SidebarContent.tsx apps/admin/components/admin/__tests__/SidebarContent.test.tsx
git commit -m "feat(admin): extract SidebarContent + add AdminDrawerContext"
```

---

## Task 2: Refactor Sidebar.tsx + create MobileSidebar + AdminShell + wire layout.tsx

**Files:**
- Modify: `apps/admin/components/admin/Sidebar.tsx`
- Create: `apps/admin/components/admin/MobileSidebar.tsx`
- Create: `apps/admin/components/admin/AdminShell.tsx`
- Modify: `apps/admin/app/admin/layout.tsx`

No new tests in this task — the layout wiring is integration-level. Manual verify in Task 3.

- [ ] **Step 1: Replace `Sidebar.tsx` with a thin desktop-only wrapper**

Replace the entire file content:

```tsx
// apps/admin/components/admin/Sidebar.tsx
import { SidebarContent } from './SidebarContent'

interface Props {
  userEmail: string
}

export function Sidebar({ userEmail }: Props) {
  return (
    <aside className="hidden md:flex w-[220px] flex-shrink-0 bg-[#1d1d1f] flex-col h-full">
      <SidebarContent userEmail={userEmail} />
    </aside>
  )
}
```

- [ ] **Step 2: Create `MobileSidebar.tsx`**

```tsx
// apps/admin/components/admin/MobileSidebar.tsx
'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { SidebarContent } from './SidebarContent'

interface Props {
  open: boolean
  onClose: () => void
  userEmail: string
}

export function MobileSidebar({ open, onClose, userEmail }: Props) {
  const pathname = usePathname()
  const isFirstRender = useRef(true)

  // Close when route changes (but not on initial mount)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    onClose()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll lock while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  return (
    <div
      className={`md:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
        open ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div onClick={onClose} className="absolute inset-0 bg-black/50" />
      <aside
        className={`absolute left-0 top-0 bottom-0 w-[280px] bg-[#1d1d1f] flex flex-col transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <SidebarContent userEmail={userEmail} onItemClick={onClose} />
      </aside>
    </div>
  )
}
```

- [ ] **Step 3: Create `AdminShell.tsx`**

```tsx
// apps/admin/components/admin/AdminShell.tsx
'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext'

interface Props {
  userEmail: string
  children: React.ReactNode
}

export function AdminShell({ userEmail, children }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <AdminDrawerContext.Provider value={{ openDrawer: () => setDrawerOpen(true) }}>
      <div className="flex h-screen overflow-hidden bg-[#f5f5f7]">
        <Sidebar userEmail={userEmail} />
        <MobileSidebar
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          userEmail={userEmail}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </AdminDrawerContext.Provider>
  )
}
```

- [ ] **Step 4: Update `layout.tsx` to use `AdminShell`**

Replace the file:

```tsx
// apps/admin/app/admin/layout.tsx
import { redirect } from 'next/navigation'
import { createAuthClient } from '@/lib/supabase'
import { createServerClient } from '@iskotify/utils'
import { AdminShell } from '@/components/admin/AdminShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user = null
  try {
    const auth = await createAuthClient()
    const { data } = await auth.auth.getUser()
    user = data.user
  } catch {
    redirect('/login')
  }

  if (!user) redirect('/login')

  let isAdmin = false
  try {
    const db = createServerClient()
    const { data: profile } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    isAdmin = profile?.role === 'admin'
  } catch {
    // DB unavailable — deny access
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="text-center">
          <p className="text-4xl font-heading font-bold text-[#1d1d1f] mb-2">403</p>
          <p className="text-[#6e6e73]">Your account does not have admin access.</p>
        </div>
      </div>
    )
  }

  return <AdminShell userEmail={user.email ?? ''}>{children}</AdminShell>
}
```

- [ ] **Step 5: Run the full test suite to verify nothing broke**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All previously passing tests still pass. No new failures.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/admin/Sidebar.tsx apps/admin/components/admin/MobileSidebar.tsx apps/admin/components/admin/AdminShell.tsx apps/admin/app/admin/layout.tsx
git commit -m "feat(admin): AdminShell + MobileSidebar drawer replaces hard-coded layout"
```

---

## Task 3: Topbar hamburger button (consumes AdminDrawerContext)

**Files:**
- Modify: `apps/admin/components/admin/Topbar.tsx`

- [ ] **Step 1: Replace `Topbar.tsx`**

Topbar must become `'use client'` to consume the context. The `SyncNowButton` it renders is already a client component, so this is safe.

```tsx
// apps/admin/components/admin/Topbar.tsx
'use client'

import { SyncNowButton } from './SyncNowButton'
import { useAdminDrawer } from '../../contexts/AdminDrawerContext'

interface Props {
  title: string
  showSyncButton?: boolean
}

export function Topbar({ title, showSyncButton = false }: Props) {
  const { openDrawer } = useAdminDrawer()

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-6 h-[52px] bg-white/90 backdrop-blur-[20px] saturate-[180%] border-b border-black/[0.08] flex-shrink-0">
      <div className="flex items-center gap-2">
        <button
          onClick={openDrawer}
          aria-label="Open menu"
          className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#f5f5f7] -ml-1.5"
        >
          <span className="text-xl">☰</span>
        </button>
        <h1 className="font-heading font-bold text-[15px] md:text-[17px] text-[#1d1d1f] tracking-tight">
          {title}
        </h1>
      </div>
      {showSyncButton && (
        <div className="flex items-center gap-2">
          <button className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium border border-black/[0.08] text-[#1d1d1f] bg-white hover:bg-[#f5f5f7] transition-colors shadow-sm">
            ⬇ Export CSV
          </button>
          <SyncNowButton />
        </div>
      )}
    </header>
  )
}
```

- [ ] **Step 2: Run tests**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass. (Topbar has no unit test — it's covered by manual verification.)

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/admin/Topbar.tsx
git commit -m "feat(admin): Topbar hamburger button + responsive padding via AdminDrawerContext"
```

---

## Task 4: Responsive padding + grid fixes

**Files:**
- Modify: `apps/admin/app/admin/listings/page.tsx` (grid + padding)
- Modify: `apps/admin/app/admin/sync/page.tsx` (padding)

No tests — pure CSS class changes.

- [ ] **Step 1: Update `listings/page.tsx`**

Change two lines (lines 43–44):

**Before:**
```tsx
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div className="grid grid-cols-4 gap-4">
```

**After:**
```tsx
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
```

- [ ] **Step 2: Update `sync/page.tsx`**

Change line 23:

**Before:**
```tsx
      <div className="flex-1 overflow-y-auto p-6">
```

**After:**
```tsx
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
```

- [ ] **Step 3: Run tests**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/admin/listings/page.tsx apps/admin/app/admin/sync/page.tsx
git commit -m "fix(admin): responsive padding + 2-col stat grid on mobile"
```

---

## Task 5: ListingTable mobile card layout

**Files:**
- Modify: `apps/admin/components/admin/ListingTable.tsx`

- [ ] **Step 1: Update `ListingTable.tsx`**

The existing `<div className="overflow-x-auto">` block wrapping the table should be changed to `hidden md:block`. Then add a `md:hidden` mobile cards section. Full updated file:

```tsx
// apps/admin/components/admin/ListingTable.tsx
'use client'

import { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import { ListingDrawer } from './ListingDrawer'
import { ConfirmDialog } from './ConfirmDialog'
import { useRouter } from 'next/navigation'

const TYPE_FILTERS = ['All', 'Scholarships', 'Exams', 'Active', 'Upcoming', 'Closed'] as const

const TYPE_STYLE: Record<string, string> = {
  scholarship: 'bg-[#fef2f2] text-[#800000]',
  exam:        'bg-[#eff6ff] text-[#1e3a8a]'
}

const STATUS_STYLE: Record<string, string> = {
  active:   'bg-green-100 text-green-800',
  upcoming: 'bg-amber-100 text-amber-800',
  closed:   'bg-gray-100 text-gray-500'
}

export function ListingTable({ listings }: { listings: Listing[] }) {
  const [filter, setFilter] = useState('All')
  const [drawerListing, setDrawerListing] = useState<Listing | null | 'new'>(null)
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null)
  const router = useRouter()

  const filtered = listings.filter(l => {
    if (filter === 'Scholarships') return l.type === 'scholarship'
    if (filter === 'Exams') return l.type === 'exam'
    if (filter === 'Active') return l.status === 'active'
    if (filter === 'Upcoming') return l.status === 'upcoming'
    if (filter === 'Closed') return l.status === 'closed'
    return true
  })

  async function handleDelete(listing: Listing) {
    await fetch(`/api/admin/listings/${listing.id}`, { method: 'DELETE' })
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <>
      <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Filter bar */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/[0.05] flex-wrap">
          <p className="font-heading font-bold text-[15px] text-[#1d1d1f] flex-1">Listings</p>
          {TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-[980px] px-3 py-1 text-[11px] font-medium transition-colors ${
                filter === f
                  ? 'bg-[#fef2f2] text-[#800000] border border-[rgba(128,0,0,0.2)]'
                  : 'bg-[#f5f5f7] text-[#6e6e73] border border-transparent'
              }`}
            >
              {f}
            </button>
          ))}
          <button
            onClick={() => setDrawerListing('new')}
            className="rounded-[980px] px-4 py-1.5 text-[11px] font-medium bg-[#1d1d1f] text-white hover:bg-[#3a3a3c] transition-colors"
          >
            + Add Listing
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#fafafa]">
                {['Name', 'Type', 'Status', 'Region', 'Deadline', ''].map(h => (
                  <th key={h} className="px-5 py-2 text-left text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider border-b border-black/[0.05]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(l => (
                <tr key={l.id} className="hover:bg-black/[0.015] transition-colors">
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <p className="text-[13px] font-medium text-[#1d1d1f]">{l.title}</p>
                    <p className="text-[11px] text-[#aeaeb2]">{l.provider}</p>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[l.type]}`}>{l.type}</span>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04] text-[12px] text-[#6e6e73]">{l.region || '—'}</td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04] text-[12px] text-[#6e6e73]">
                    {l.deadline ? new Date(l.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-5 py-2.5 border-b border-black/[0.04]">
                    <div className="flex gap-1">
                      <button
                        onClick={() => setDrawerListing(l)}
                        className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm hover:bg-[#e5e5ea] transition-colors"
                        title="Edit"
                      >✏️</button>
                      <button
                        onClick={() => setDeleteTarget(l)}
                        className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm hover:bg-red-50 transition-colors"
                        title="Delete"
                      >🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">No listings match this filter.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-black/[0.04]">
          {filtered.map(l => (
            <div key={l.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#1d1d1f] truncate">{l.title}</p>
                  <p className="text-[11px] text-[#aeaeb2]">{l.provider}</p>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button
                    onClick={() => setDrawerListing(l)}
                    className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm"
                    title="Edit"
                  >✏️</button>
                  <button
                    onClick={() => setDeleteTarget(l)}
                    className="w-7 h-7 rounded-lg bg-[#f5f5f7] border border-black/[0.08] flex items-center justify-center text-sm"
                    title="Delete"
                  >🗑</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[l.type]}`}>{l.type}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${STATUS_STYLE[l.status]}`}>{l.status}</span>
                {l.region && <span className="rounded-md px-2 py-0.5 text-[10px] bg-[#f5f5f7] text-[#6e6e73]">{l.region}</span>}
              </div>
              {l.deadline && (
                <p className="text-[11px] text-[#aeaeb2] mt-1">
                  Deadline: {new Date(l.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-[#aeaeb2]">No listings match this filter.</p>
          )}
        </div>
      </div>

      {drawerListing !== null && (
        <ListingDrawer
          listing={drawerListing === 'new' ? null : drawerListing}
          onClose={() => setDrawerListing(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Run tests**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/components/admin/ListingTable.tsx
git commit -m "feat(admin): ListingTable mobile card layout (md:hidden pattern)"
```

---

## Task 6: Flashcards subjects page — drill-down links + mobile cards + responsive padding

**Files:**
- Modify: `apps/admin/app/admin/flashcards/page.tsx`

- [ ] **Step 1: Replace `flashcards/page.tsx`**

```tsx
// apps/admin/app/admin/flashcards/page.tsx
import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const { data: subjects } = await db
    .from('flashcard_subjects')
    .select(`
      id,
      name,
      flashcard_topics (
        id,
        name,
        status,
        flashcards (id, status)
      )
    `)
    .order('name')
  return subjects ?? []
}

function statusBadge(status: string) {
  return status === 'published'
    ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">PUBLISHED</span>
    : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">DRAFT</span>
}

export default async function FlashcardsPage() {
  const subjects = await getData()

  return (
    <>
      <Topbar title="Knowledge Base" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
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
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(subject => {
                    const topics = (subject.flashcard_topics ?? []) as Array<{ id: string; name: string; status: string; flashcards: Array<{ id: string; status: string }> }>
                    const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
                    const overallStatus = topics.some(t => t.status === 'published') ? 'published' : 'draft'
                    return (
                      <tr key={subject.id} className="border-b border-[#f3f4f6] last:border-0 hover:bg-[#f9fafb]">
                        <td className="px-5 py-3">
                          <Link
                            href={`/admin/flashcards/subjects/${subject.id}`}
                            className="font-medium text-[#1d1d1f] hover:text-[#800000] transition-colors"
                          >
                            {subject.name}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[#374151]">{topics.length}</td>
                        <td className="px-5 py-3 text-[#374151]">{totalCards}</td>
                        <td className="px-5 py-3">{statusBadge(overallStatus)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {subjects.map(subject => {
                const topics = (subject.flashcard_topics ?? []) as Array<{ id: string; name: string; status: string; flashcards: Array<{ id: string; status: string }> }>
                const totalCards = topics.reduce((sum, t) => sum + (t.flashcards?.length ?? 0), 0)
                const overallStatus = topics.some(t => t.status === 'published') ? 'published' : 'draft'
                return (
                  <Link
                    key={subject.id}
                    href={`/admin/flashcards/subjects/${subject.id}`}
                    className="flex items-center justify-between bg-white border border-[#e5e7eb] rounded-2xl p-4"
                  >
                    <div>
                      <p className="font-medium text-[#1d1d1f]">{subject.name}</p>
                      <p className="text-xs text-[#6e6e73] mt-0.5">{topics.length} topics · {totalCards} cards</p>
                      <div className="mt-1">{statusBadge(overallStatus)}</div>
                    </div>
                    <span className="text-[#aeaeb2] text-lg ml-2">›</span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Run tests**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/admin/app/admin/flashcards/page.tsx
git commit -m "feat(admin): flashcards subjects list — drill-down links + mobile card layout"
```

---

## Task 7: POST /api/flashcards/topics route

**Files:**
- Create: `apps/admin/app/api/flashcards/topics/route.ts`
- Create: `apps/admin/app/api/flashcards/topics/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/app/api/flashcards/topics/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

const mockSingle = vi.fn()
const mockSelectSingle = vi.fn(() => ({ single: mockSingle }))
const mockInsert = vi.fn(() => ({ select: mockSelectSingle }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mockInsert })),
  })),
}))

describe('POST /api/flashcards/topics', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSingle.mockClear()
    mockInsert.mockClear()
    mockSelectSingle.mockClear()
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/topics', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when subject_id is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ name: 'Algebra' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/subject_id/i)
  })

  it('returns 400 when name is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/name/i)
  })

  it('returns 400 when name is blank whitespace', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: '   ' }))
    expect(res.status).toBe(400)
  })

  it('inserts topic and returns { id }', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'topic-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: 'Algebra Basics' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe('topic-new')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ subject_id: 'sub-1', name: 'Algebra Basics', status: 'published' })
    )
  })

  it('uses provided status when valid', async () => {
    mockSingle.mockResolvedValueOnce({ data: { id: 'topic-draft' }, error: null })
    const { POST } = await import('../route')
    await POST(makeReq({ subject_id: 'sub-1', name: 'Draft Topic', status: 'draft' }))
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    )
  })

  it('returns 500 when Supabase insert fails', async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ subject_id: 'sub-1', name: 'Algebra' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/admin && pnpm exec vitest run app/api/flashcards/topics/__tests__/route.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `app/api/flashcards/topics/route.ts`**

```ts
// apps/admin/app/api/flashcards/topics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { subject_id, name, status } = body as {
      subject_id?: string
      name?: string
      status?: string
    }

    if (!subject_id || subject_id.trim() === '') {
      return NextResponse.json({ error: 'subject_id is required' }, { status: 400 })
    }
    if (!name || name.trim() === '') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    if (status && status !== 'published' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "published" or "draft"' }, { status: 400 })
    }

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('flashcard_topics')
      .insert({ subject_id: subject_id.trim(), name: name.trim(), status: status ?? 'published' })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[topics/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('[topics/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/admin && pnpm exec vitest run app/api/flashcards/topics/__tests__/route.test.ts
```
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/app/api/flashcards/topics/route.ts apps/admin/app/api/flashcards/topics/__tests__/route.test.ts
git commit -m "feat(admin): POST /api/flashcards/topics — create topic in existing subject"
```

---

## Task 8: POST /api/flashcards/cards (extend existing GET file)

**Files:**
- Modify: `apps/admin/app/api/flashcards/cards/route.ts` (add `POST`, keep `GET`)
- Create: `apps/admin/app/api/flashcards/cards/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/admin/app/api/flashcards/cards/__tests__/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// Sibling lookup chain: .select().eq().limit().single()
const mockSiblingSingle = vi.fn()
const mockSiblingLimit = vi.fn(() => ({ single: mockSiblingSingle }))
const mockSiblingEq = vi.fn(() => ({ limit: mockSiblingLimit }))
const mockSiblingSelect = vi.fn(() => ({ eq: mockSiblingEq }))

// Insert chain: .insert().select().single()
const mockInsertSingle = vi.fn()
const mockInsertSelect = vi.fn(() => ({ single: mockInsertSingle }))
const mockInsert = vi.fn(() => ({ select: mockInsertSelect }))

vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: mockSiblingSelect,
      insert: mockInsert,
    })),
  })),
}))

describe('POST /api/flashcards/cards', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSiblingSingle.mockClear()
    mockInsert.mockClear()
    mockInsertSingle.mockClear()
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/flashcards/cards', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    })
  }

  it('returns 400 when topic_id is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ question: 'Q', answer: 'A' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/topic_id/i)
  })

  it('returns 400 when question is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', answer: 'A' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/question/i)
  })

  it('returns 400 when answer is missing', async () => {
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/answer/i)
  })

  it('inserts card with provided listing_slugs and returns { id }', async () => {
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({
      topic_id: 'topic-1',
      question: 'What is 2+2?',
      answer: '4',
      listing_slugs: ['upcat-2026'],
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe('card-new')
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: ['upcat-2026'] })
    )
  })

  it('inherits listing_slugs from sibling card when not provided', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: { listing_slugs: ['dost-2026'] }, error: null })
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: ['dost-2026'] })
    )
  })

  it('falls back to [] when no listing_slugs and no sibling cards exist', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows' } })
    mockInsertSingle.mockResolvedValueOnce({ data: { id: 'card-new' }, error: null })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(200)
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ listing_slugs: [] })
    )
  })

  it('returns 500 when insert fails', async () => {
    mockSiblingSingle.mockResolvedValueOnce({ data: null, error: { message: 'No rows' } })
    mockInsertSingle.mockResolvedValueOnce({ data: null, error: { message: 'DB error' } })
    const { POST } = await import('../route')
    const res = await POST(makeReq({ topic_id: 'topic-1', question: 'Q', answer: 'A' }))
    expect(res.status).toBe(500)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/admin && pnpm exec vitest run app/api/flashcards/cards/__tests__/route.test.ts
```
Expected: FAIL — `POST` export does not exist yet.

- [ ] **Step 3: Add `POST` handler to `app/api/flashcards/cards/route.ts`**

Keep the existing `GET` function exactly as-is, and append the new `POST` function:

```ts
// APPEND to apps/admin/app/api/flashcards/cards/route.ts
// (keep existing GET handler at top of file, add this below it)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { topic_id, question, answer, explanation, status, listing_slugs } = body as {
      topic_id?: string
      question?: string
      answer?: string
      explanation?: string
      status?: string
      listing_slugs?: string[]
    }

    if (!topic_id) return NextResponse.json({ error: 'topic_id is required' }, { status: 400 })
    if (!question || question.trim() === '') return NextResponse.json({ error: 'question is required' }, { status: 400 })
    if (!answer || answer.trim() === '') return NextResponse.json({ error: 'answer is required' }, { status: 400 })
    if (status && status !== 'published' && status !== 'draft') {
      return NextResponse.json({ error: 'status must be "published" or "draft"' }, { status: 400 })
    }

    const supabase = createServerClient()

    let resolvedSlugs: string[]
    if (listing_slugs && listing_slugs.length > 0) {
      resolvedSlugs = listing_slugs
    } else {
      const { data: sibling } = await supabase
        .from('flashcards')
        .select('listing_slugs')
        .eq('topic_id', topic_id)
        .limit(1)
        .single()
      resolvedSlugs = sibling?.listing_slugs ?? []
    }

    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        topic_id,
        question: question.trim(),
        answer: answer.trim(),
        explanation: explanation?.trim() ?? '',
        status: status ?? 'published',
        listing_slugs: resolvedSlugs,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('[cards/POST] insert error:', error)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    console.error('[cards/POST] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```
cd apps/admin && pnpm exec vitest run app/api/flashcards/cards/__tests__/route.test.ts
```
Expected: 6 tests PASS.

- [ ] **Step 5: Run full suite to verify GET tests unaffected**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/api/flashcards/cards/route.ts apps/admin/app/api/flashcards/cards/__tests__/route.test.ts
git commit -m "feat(admin): POST /api/flashcards/cards — add card to existing topic"
```

---

## Task 9: Breadcrumb + modal components (AddTopicModal, AddTopicButton, AddCardModal, AddCardButton)

**Files:**
- Create: `apps/admin/components/admin/Breadcrumb.tsx`
- Create: `apps/admin/components/admin/AddTopicModal.tsx`
- Create: `apps/admin/components/admin/AddTopicButton.tsx`
- Create: `apps/admin/components/admin/AddCardModal.tsx`
- Create: `apps/admin/components/admin/AddCardButton.tsx`
- Create: `apps/admin/components/admin/__tests__/Breadcrumb.test.tsx`
- Create: `apps/admin/components/admin/__tests__/AddTopicModal.test.tsx`
- Create: `apps/admin/components/admin/__tests__/AddCardModal.test.tsx`

- [ ] **Step 1: Write failing tests**

```ts
// apps/admin/components/admin/__tests__/Breadcrumb.test.tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}))

import { Breadcrumb } from '../Breadcrumb'

describe('Breadcrumb', () => {
  it('renders all item labels', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [
          { label: 'Subjects', href: '/admin/flashcards' },
          { label: 'Math', href: '/admin/flashcards/subjects/abc' },
          { label: 'Algebra' },
        ],
      })
    )
    expect(html).toContain('Subjects')
    expect(html).toContain('Math')
    expect(html).toContain('Algebra')
  })

  it('renders a link for non-last items that have href', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'Algebra' }],
      })
    )
    expect(html).toContain('href="/admin/flashcards"')
  })

  it('does not render last item as a link', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'Subjects', href: '/admin/flashcards' }, { label: 'LastItem' }],
      })
    )
    expect(html).not.toContain('>LastItem</a>')
  })

  it('renders separator between items', () => {
    const html = renderToStaticMarkup(
      React.createElement(Breadcrumb, {
        items: [{ label: 'A', href: '/a' }, { label: 'B' }],
      })
    )
    expect(html).toContain('›')
  })
})
```

```ts
// apps/admin/components/admin/__tests__/AddTopicModal.test.tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AddTopicModal } from '../AddTopicModal'

describe('AddTopicModal', () => {
  it('renders the topic name input', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddTopicModal, { subjectId: 'sub-1', onClose: vi.fn() })
    )
    expect(html).toContain('Topic name')
    expect(html).toContain('Add Topic')
  })

  it('save button is disabled in initial empty state', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddTopicModal, { subjectId: 'sub-1', onClose: vi.fn() })
    )
    expect(html).toContain('disabled')
  })
})
```

```ts
// apps/admin/components/admin/__tests__/AddCardModal.test.tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { AddCardModal } from '../AddCardModal'

describe('AddCardModal', () => {
  it('renders question, answer, and explanation fields', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('Question')
    expect(html).toContain('Answer')
    expect(html).toContain('Explanation')
  })

  it('save button is disabled in initial empty state', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('disabled')
  })

  it('renders "Add Card" title', () => {
    const html = renderToStaticMarkup(
      React.createElement(AddCardModal, { topicId: 'topic-1', topicStatus: 'published', onClose: vi.fn() })
    )
    expect(html).toContain('Add Card')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/admin && pnpm exec vitest run components/admin/__tests__/Breadcrumb.test.tsx components/admin/__tests__/AddTopicModal.test.tsx components/admin/__tests__/AddCardModal.test.tsx
```
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `Breadcrumb.tsx`**

```tsx
// apps/admin/components/admin/Breadcrumb.tsx
import Link from 'next/link'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface Props {
  items: BreadcrumbItem[]
}

export function Breadcrumb({ items }: Props) {
  return (
    <nav className="flex items-center gap-1 text-sm text-[#6e6e73] flex-wrap">
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        return (
          <span key={idx} className="flex items-center gap-1">
            {idx > 0 && <span className="text-[#aeaeb2]">›</span>}
            {isLast || !item.href ? (
              <span className={isLast ? 'font-semibold text-[#1d1d1f]' : ''}>{item.label}</span>
            ) : (
              <Link href={item.href} className="hover:text-[#1d1d1f] transition-colors">
                {item.label}
              </Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 4: Create `AddTopicModal.tsx`**

```tsx
// apps/admin/components/admin/AddTopicModal.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subjectId: string
  onClose: () => void
}

export function AddTopicModal({ subjectId, onClose }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, name: name.trim(), status: 'published' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]'
  const labelCls = 'block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-[17px] text-[#1d1d1f]">Add Topic</h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Topic name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Algebra Basics"
              className={inputCls}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create `AddTopicButton.tsx`**

```tsx
// apps/admin/components/admin/AddTopicButton.tsx
'use client'

import { useState } from 'react'
import { AddTopicModal } from './AddTopicModal'

interface Props {
  subjectId: string
}

export function AddTopicButton({ subjectId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
      >
        + Add Topic
      </button>
      {open && <AddTopicModal subjectId={subjectId} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 6: Create `AddCardModal.tsx`**

```tsx
// apps/admin/components/admin/AddCardModal.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  topicId: string
  topicStatus: 'published' | 'draft'
  onClose: () => void
}

export function AddCardModal({ topicId, topicStatus, onClose }: Props) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !answer.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: topicId,
          question: question.trim(),
          answer: answer.trim(),
          explanation: explanation.trim(),
          status: topicStatus,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const textareaCls = 'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f] resize-none'
  const labelCls = 'block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-[17px] text-[#1d1d1f]">Add Card</h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Question</label>
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              rows={3}
              placeholder="e.g. What is the quadratic formula?"
              className={textareaCls}
              autoFocus
            />
          </div>
          <div>
            <label className={labelCls}>Answer</label>
            <textarea
              value={answer}
              onChange={e => setAnswer(e.target.value)}
              rows={3}
              placeholder="e.g. x = (-b ± √(b²-4ac)) / 2a"
              className={textareaCls}
            />
          </div>
          <div>
            <label className={labelCls}>Explanation (optional)</label>
            <textarea
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              rows={2}
              placeholder="e.g. Derived from completing the square…"
              className={textareaCls}
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!question.trim() || !answer.trim() || saving}
              className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create `AddCardButton.tsx`**

```tsx
// apps/admin/components/admin/AddCardButton.tsx
'use client'

import { useState } from 'react'
import { AddCardModal } from './AddCardModal'

interface Props {
  topicId: string
  topicStatus: 'published' | 'draft'
}

export function AddCardButton({ topicId, topicStatus }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 text-xs font-semibold bg-[#800000] text-white rounded-lg hover:bg-[#6b0000] transition-colors"
      >
        + Add Card
      </button>
      {open && <AddCardModal topicId={topicId} topicStatus={topicStatus} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

```
cd apps/admin && pnpm exec vitest run components/admin/__tests__/Breadcrumb.test.tsx components/admin/__tests__/AddTopicModal.test.tsx components/admin/__tests__/AddCardModal.test.tsx
```
Expected: 9 tests PASS total (4 + 2 + 3).

- [ ] **Step 9: Run full suite**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 10: Commit**

```bash
git add apps/admin/components/admin/Breadcrumb.tsx apps/admin/components/admin/AddTopicModal.tsx apps/admin/components/admin/AddTopicButton.tsx apps/admin/components/admin/AddCardModal.tsx apps/admin/components/admin/AddCardButton.tsx apps/admin/components/admin/__tests__/Breadcrumb.test.tsx apps/admin/components/admin/__tests__/AddTopicModal.test.tsx apps/admin/components/admin/__tests__/AddCardModal.test.tsx
git commit -m "feat(admin): Breadcrumb + AddTopicModal + AddCardModal + button wrappers"
```

---

## Task 10: Drill-down pages — Subject detail + Topic detail

**Files:**
- Create: `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx`
- Create: `apps/admin/app/admin/flashcards/topics/[id]/page.tsx`

No automated tests for server page components (they require full Next.js rendering environment). Covered by manual verification in the spec (§8).

- [ ] **Step 1: Create `subjects/[id]/page.tsx`**

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
            No topics yet. Use the "+ Add Topic" button to create one.
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {topics.map(topic => (
                <Link
                  key={topic.id}
                  href={`/admin/flashcards/topics/${topic.id}`}
                  className="flex items-center justify-between bg-white border border-[#e5e7eb] rounded-2xl p-4"
                >
                  <div>
                    <p className="font-medium text-[#1d1d1f]">{topic.name}</p>
                    <p className="text-xs text-[#6e6e73] mt-0.5">{topic.flashcards?.length ?? 0} cards</p>
                    <div className="mt-1">{statusBadge(topic.status)}</div>
                  </div>
                  <span className="text-[#aeaeb2] text-lg ml-2">›</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Create `topics/[id]/page.tsx`**

```tsx
// apps/admin/app/admin/flashcards/topics/[id]/page.tsx
import { createServerClient } from '@iskotify/utils'
import { notFound } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { Breadcrumb } from '@/components/admin/Breadcrumb'
import { AddCardButton } from '@/components/admin/AddCardButton'

export const dynamic = 'force-dynamic'

export default async function TopicDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data: topic } = await db
    .from('flashcard_topics')
    .select('id, name, status, subject_id')
    .eq('id', id)
    .single()

  if (!topic) notFound()

  const { data: subject } = await db
    .from('flashcard_subjects')
    .select('id, name')
    .eq('id', topic.subject_id)
    .single()

  const { data: cardsRaw } = await db
    .from('flashcards')
    .select('id, question, answer, explanation')
    .eq('topic_id', id)
    .order('created_at')

  const cards = (cardsRaw ?? []) as Array<{
    id: string
    question: string
    answer: string
    explanation: string
  }>

  const topicStatus = topic.status as 'published' | 'draft'

  return (
    <>
      <Topbar title={topic.name} />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Breadcrumb items={[
            { label: 'Subjects', href: '/admin/flashcards' },
            { label: subject?.name ?? '…', href: `/admin/flashcards/subjects/${topic.subject_id}` },
            { label: topic.name },
          ]} />
          <AddCardButton topicId={id} topicStatus={topicStatus} />
        </div>

        <p className="text-sm text-[#6e6e73]">{cards.length} card{cards.length !== 1 ? 's' : ''}</p>

        {cards.length === 0 ? (
          <div className="text-center py-16 text-[#6e6e73] text-sm">
            No cards in this topic yet. Use the "+ Add Card" button to create one.
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">Question</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73] w-[35%]">Answer</th>
                    <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-wide text-[#6e6e73]">Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {cards.map(card => (
                    <tr key={card.id} className="border-b border-[#f3f4f6] last:border-0">
                      <td className="px-5 py-3 text-[#1d1d1f]">{card.question}</td>
                      <td className="px-5 py-3 text-[#374151]">{card.answer}</td>
                      <td className="px-5 py-3 text-[#6e6e73] text-[12px]">{card.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {cards.map(card => (
                <div key={card.id} className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-1">
                  <p className="font-medium text-[#1d1d1f] text-sm">{card.question}</p>
                  <p className="text-sm text-[#374151]">{card.answer}</p>
                  {card.explanation && (
                    <p className="text-xs text-[#6e6e73]">{card.explanation}</p>
                  )}
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

- [ ] **Step 3: Run full test suite**

```
cd apps/admin && pnpm exec vitest run
```
Expected: All tests pass.

- [ ] **Step 4: Run type-check**

```
cd apps/admin && pnpm exec tsc --noEmit
```
Expected: No type errors.

- [ ] **Step 5: Run build**

```
cd apps/admin && pnpm build
```
Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/app/admin/flashcards/subjects apps/admin/app/admin/flashcards/topics
git commit -m "feat(admin): drill-down pages for subjects and topics"
```

---

## Manual Verification Checklist (Vercel Preview)

After the branch is pushed, Vercel will auto-deploy a preview URL. Test on Chrome devtools → mobile emulator at **375×812 (iPhone SE)**:

- [ ] Sign in as admin on the preview URL
- [ ] **Hamburger:** Tap ☰ → drawer slides in from left · tap overlay → closes · press Escape → closes · tap any nav item → closes
- [ ] **Sidebar:** At ≥768px, sidebar is visible, hamburger is hidden, no layout change from before
- [ ] **Listings:** Stat cards show 2 per row (mobile), 4 per row (desktop) · listing rows show as vertical cards (mobile) with edit/delete buttons · no horizontal page scroll
- [ ] **Subjects list:** Subjects show as clickable cards on mobile with `›` chevron · tapping a subject navigates to subject detail
- [ ] **Subject detail:** Breadcrumb `Subjects / Math` shows · topics list with card count and status badge · `+ Add Topic` opens modal → fill name → Save → topic appears in list
- [ ] **Topic detail:** Breadcrumb `Subjects / Math / Algebra` shows · card list · `+ Add Card` opens modal → fill Q+A → Save → card appears
- [ ] **Back button:** Works at all three levels

---

## Notes for the Implementer

- **Vitest environment is `node`** (see `apps/admin/vitest.config.ts`). Component tests use `renderToStaticMarkup` from `react-dom/server`, not `@testing-library/react`. Don't add jsdom.
- **`pnpm exec vitest run`** runs all tests. Use `vitest run <path>` to run a specific file.
- **`createServerClient()`** from `@iskotify/utils` is the Supabase client for server components and API routes. Do not import from `@supabase/ssr` directly in server code.
- **`'use client'`** — all components that use React hooks (`useState`, `useEffect`, context) must have this directive at the top of the file.
- **The existing `/admin/flashcards/new` bulk form is not touched.** The "+ Add manually" button on the subjects list still links there.
- **No database migrations.** No Supabase schema changes. No mobile app changes.
