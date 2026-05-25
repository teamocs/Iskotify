# PR 12C — Admin UX: Nav Cleanup, Skeleton Loading, Clickable Stat Cards

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale nav items, add skeleton loading + slide-up page transitions across all admin pages, and make listings stat cards clickable to filter the table in place.

**Architecture:** Nav cleanup is a one-line array change. Page transitions use a `PageTransition` client wrapper with `key={pathname}` to re-mount on every navigation, triggering a CSS `slideUp` animation. Skeletons are `loading.tsx` files at each route segment. Clickable stat cards are wired through a new `ListingsView` client component that owns the shared `filter` state for both cards and table.

**Tech Stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Vitest (node env, renderToStaticMarkup)

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `apps/admin/components/admin/SidebarContent.tsx` | Modify | Remove Scholarships + Exams nav items |
| `apps/admin/tailwind.config.ts` | Modify | Add `slideUp` animation + keyframes |
| `apps/admin/components/admin/PageTransition.tsx` | Create | Client wrapper — `key={pathname}` forces re-mount + animation on navigation |
| `apps/admin/components/admin/AdminShell.tsx` | Modify | Replace inner div with `<PageTransition>` |
| `apps/admin/components/admin/__tests__/PageTransition.test.tsx` | Create | 1 render test |
| `apps/admin/app/admin/listings/loading.tsx` | Create | Listings skeleton |
| `apps/admin/app/admin/sync/loading.tsx` | Create | Sync skeleton |
| `apps/admin/app/admin/flashcards/loading.tsx` | Create | Subjects skeleton |
| `apps/admin/app/admin/flashcards/subjects/[id]/loading.tsx` | Create | Subject detail skeleton |
| `apps/admin/app/admin/flashcards/subjects/[id]/cards/loading.tsx` | Create | Cards skeleton |
| `apps/admin/app/admin/flashcards/upload/loading.tsx` | Create | Upload skeleton |
| `apps/admin/app/admin/__tests__/loading.test.tsx` | Create | 3 skeleton render tests |
| `apps/admin/components/admin/StatCard.tsx` | Modify | Add `onClick?` + `active?` props; conditional button/div render |
| `apps/admin/components/admin/__tests__/StatCard.test.tsx` | Create | 3 tests |
| `apps/admin/components/admin/SyncPanel.tsx` | Modify | Export `SyncLog` interface |
| `apps/admin/components/admin/ListingTable.tsx` | Modify | Accept controlled `filter` + `onFilterChange` props; remove internal useState |
| `apps/admin/components/admin/__tests__/ListingTable.test.tsx` | Create | 2 tests |
| `apps/admin/components/admin/ListingsView.tsx` | Create | Client wrapper — owns filter state, renders stat cards + table |
| `apps/admin/components/admin/__tests__/ListingsView.test.tsx` | Create | 2 tests |
| `apps/admin/app/admin/listings/page.tsx` | Modify | Remove StatCard/SyncPanel/ListingTable; delegate render to ListingsView |

---

### Task 1: Nav cleanup + Tailwind slideUp animation

**Files:**
- Modify: `apps/admin/components/admin/SidebarContent.tsx:11-15`
- Modify: `apps/admin/tailwind.config.ts:40-45`

- [ ] **Step 1: Remove Scholarships and Exams from the NAV array**

In `apps/admin/components/admin/SidebarContent.tsx`, replace the LISTINGS section (lines 10–16):

```ts
// BEFORE
{
  section: 'LISTINGS',
  items: [
    { href: '/admin/listings', icon: '📋', label: 'All Listings' },
    { href: '/admin/listings?type=scholarship', icon: '🎓', label: 'Scholarships' },
    { href: '/admin/listings?type=exam', icon: '📝', label: 'Exams' },
  ],
},

// AFTER
{
  section: 'LISTINGS',
  items: [
    { href: '/admin/listings', icon: '📋', label: 'All Listings' },
  ],
},
```

- [ ] **Step 2: Add slideUp animation to tailwind.config.ts**

In `apps/admin/tailwind.config.ts`, add `animation` and `keyframes` to the `theme.extend` block (after the existing `boxShadow` entry):

```ts
// apps/admin/tailwind.config.ts
import type { Config } from "tailwindcss";
import sharedPreset from "@iskotify/ui/tailwind-preset";

const config: Config = {
  presets: [sharedPreset],
  content: [
    "./app/**/*.{ts,tsx,js,jsx,mdx}",
    "./components/**/*.{ts,tsx,js,jsx,mdx}",
    "../../packages/ui/src/**/*.{ts,tsx,js,jsx}"
  ],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: "#800000",
          light: "#a00000",
          dim: "rgba(128,0,0,0.08)",
          mid: "rgba(128,0,0,0.15)"
        },
        surface: {
          DEFAULT: "#ffffff",
          2: "#f5f5f7",
          3: "#fafafa"
        },
        sidebar: "#1d1d1f",
        "text-primary": "#1d1d1f",
        "text-secondary": "#6e6e73",
        "text-tertiary": "#aeaeb2"
      },
      fontFamily: {
        heading: ["Outfit", "sans-serif"],
        body: ["Lexend", "-apple-system", "sans-serif"]
      },
      borderRadius: {
        sm: "10px",
        md: "16px",
        lg: "22px",
        pill: "980px"
      },
      boxShadow: {
        sm: "0 2px 8px rgba(0,0,0,0.06), 0 0 1px rgba(0,0,0,0.04)",
        card: "0 8px 32px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)"
      },
      animation: {
        slideUp: 'slideUp 0.2s ease-out',
      },
      keyframes: {
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    }
  },
  plugins: []
};

export default config;
```

- [ ] **Step 3: Run tests to confirm nothing breaks**

```bash
cd C:\Users\User\OneDrive\Desktop\IskotifyApp
pnpm --filter admin test
```

Expected: all tests pass (the existing `SidebarContent` tests only check section headers and email — they don't test for Scholarships/Exams, so no failures).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/components/admin/SidebarContent.tsx apps/admin/tailwind.config.ts
git commit -m "feat(admin): remove scholarships/exams from nav; add slideUp animation"
```

---

### Task 2: PageTransition component + AdminShell integration

**Files:**
- Create: `apps/admin/components/admin/PageTransition.tsx`
- Modify: `apps/admin/components/admin/AdminShell.tsx:25-27`
- Create: `apps/admin/components/admin/__tests__/PageTransition.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/admin/components/admin/__tests__/PageTransition.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/listings',
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { PageTransition } from '../PageTransition'

describe('PageTransition', () => {
  it('renders children inside an animate-slideUp div', () => {
    const html = renderToStaticMarkup(
      <PageTransition><p>hello</p></PageTransition>
    )
    expect(html).toContain('hello')
    expect(html).toContain('animate-slideUp')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:\Users\User\OneDrive\Desktop\IskotifyApp
pnpm --filter admin test PageTransition
```

Expected: FAIL — `Cannot find module '../PageTransition'`

- [ ] **Step 3: Create PageTransition.tsx**

Create `apps/admin/components/admin/PageTransition.tsx`:

```tsx
'use client'

import React from 'react'
import { usePathname } from 'next/navigation'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <div key={pathname} className="flex-1 flex flex-col overflow-hidden animate-slideUp">
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter admin test PageTransition
```

Expected: PASS (1 test)

- [ ] **Step 5: Update AdminShell to use PageTransition**

In `apps/admin/components/admin/AdminShell.tsx`, add the import and replace the inner div:

```tsx
'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { MobileSidebar } from './MobileSidebar'
import { AdminDrawerContext } from '../../contexts/AdminDrawerContext'
import { PageTransition } from './PageTransition'

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
        <PageTransition>
          {children}
        </PageTransition>
      </div>
    </AdminDrawerContext.Provider>
  )
}
```

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter admin test
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/admin/PageTransition.tsx apps/admin/components/admin/AdminShell.tsx apps/admin/components/admin/__tests__/PageTransition.test.tsx
git commit -m "feat(admin): PageTransition — slide-up animation on every navigation"
```

---

### Task 3: Skeleton loading screens for all admin pages

**Files:**
- Create: `apps/admin/app/admin/listings/loading.tsx`
- Create: `apps/admin/app/admin/sync/loading.tsx`
- Create: `apps/admin/app/admin/flashcards/loading.tsx`
- Create: `apps/admin/app/admin/flashcards/subjects/[id]/loading.tsx`
- Create: `apps/admin/app/admin/flashcards/subjects/[id]/cards/loading.tsx`
- Create: `apps/admin/app/admin/flashcards/upload/loading.tsx`
- Create: `apps/admin/app/admin/__tests__/loading.test.tsx`

- [ ] **Step 1: Write failing tests for three representative skeletons**

Create `apps/admin/app/admin/__tests__/loading.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'

import ListingsLoading from '../listings/loading'
import SyncLoading from '../sync/loading'
import FlashcardsLoading from '../flashcards/loading'

describe('Skeleton loading screens', () => {
  it('listings loading renders stat card skeletons and table skeleton', () => {
    const html = renderToStaticMarkup(<ListingsLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('grid')
  })

  it('sync loading renders log entry skeletons', () => {
    const html = renderToStaticMarkup(<SyncLoading />)
    expect(html).toContain('animate-pulse')
  })

  it('flashcards loading renders row skeletons', () => {
    const html = renderToStaticMarkup(<FlashcardsLoading />)
    expect(html).toContain('animate-pulse')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter admin test loading
```

Expected: FAIL — cannot find modules

- [ ] **Step 3: Create listings/loading.tsx**

Create `apps/admin/app/admin/listings/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      {/* Topbar skeleton */}
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-40 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 animate-pulse">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-white rounded-[16px] border border-black/[0.05]" />
          ))}
        </div>
        {/* Sync panel */}
        <div className="h-16 bg-white rounded-[16px] border border-black/[0.05]" />
        {/* Table */}
        <div className="bg-white rounded-[16px] border border-black/[0.05] overflow-hidden">
          <div className="h-11 bg-[#f5f5f7] border-b border-black/[0.05]" />
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-12 border-b border-black/[0.04] bg-white" />
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Create sync/loading.tsx**

Create `apps/admin/app/admin/sync/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-32 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 animate-pulse">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="h-16 bg-white rounded-[16px] border border-black/[0.05]" />
        ))}
      </div>
    </>
  )
}
```

- [ ] **Step 5: Create flashcards/loading.tsx**

Create `apps/admin/app/admin/flashcards/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-36 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-5 w-48 bg-[#e5e7eb] rounded-[10px]" />
        <div className="bg-white rounded-[16px] border border-black/[0.05] overflow-hidden">
          <div className="h-10 bg-[#f5f5f7] border-b border-black/[0.05]" />
          {[0, 1, 2].map(i => (
            <div key={i} className="h-12 border-b border-black/[0.04] bg-white" />
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 6: Create flashcards/subjects/[id]/loading.tsx**

Create `apps/admin/app/admin/flashcards/subjects/[id]/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-44 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-5 w-56 bg-[#e5e7eb] rounded-[10px]" />
        <div className="space-y-2">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-12 bg-white rounded-[16px] border border-black/[0.05]" />
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 7: Create flashcards/subjects/[id]/cards/loading.tsx**

Create `apps/admin/app/admin/flashcards/subjects/[id]/cards/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-52 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 animate-pulse">
        <div className="h-5 w-64 bg-[#e5e7eb] rounded-[10px]" />
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="h-14 bg-white rounded-[16px] border border-black/[0.05]" />
          ))}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 8: Create flashcards/upload/loading.tsx**

Create `apps/admin/app/admin/flashcards/upload/loading.tsx`:

```tsx
export default function Loading() {
  return (
    <>
      <div className="sticky top-0 z-40 flex items-center px-4 md:px-6 h-[52px] bg-white border-b border-black/[0.08]">
        <div className="h-5 w-36 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 animate-pulse">
        <div className="h-48 bg-white rounded-[16px] border border-black/[0.05]" />
      </div>
    </>
  )
}
```

- [ ] **Step 9: Run tests to verify all pass**

```bash
pnpm --filter admin test loading
```

Expected: PASS (3 tests)

- [ ] **Step 10: Run all tests**

```bash
pnpm --filter admin test
```

Expected: all tests pass

- [ ] **Step 11: Commit**

```bash
git add apps/admin/app/admin/listings/loading.tsx apps/admin/app/admin/sync/loading.tsx apps/admin/app/admin/flashcards/loading.tsx "apps/admin/app/admin/flashcards/subjects/[id]/loading.tsx" "apps/admin/app/admin/flashcards/subjects/[id]/cards/loading.tsx" apps/admin/app/admin/flashcards/upload/loading.tsx apps/admin/app/admin/__tests__/loading.test.tsx
git commit -m "feat(admin): skeleton loading screens for all admin pages"
```

---

### Task 4: StatCard — clickable with active state

**Files:**
- Modify: `apps/admin/components/admin/StatCard.tsx`
- Create: `apps/admin/components/admin/__tests__/StatCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/admin/components/admin/__tests__/StatCard.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { StatCard } from '../StatCard'

describe('StatCard', () => {
  it('renders as a div when no onClick is provided', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Total" value={42} />
    )
    // Should NOT contain a <button> tag
    expect(html).not.toContain('<button')
    expect(html).toContain('Total')
    expect(html).toContain('42')
  })

  it('renders as a button when onClick is provided', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Active" value={5} onClick={() => {}} />
    )
    expect(html).toContain('<button')
    expect(html).toContain('Active')
    expect(html).toContain('cursor-pointer')
  })

  it('applies ring highlight class when active is true', () => {
    const html = renderToStaticMarkup(
      <StatCard label="Active" value={5} onClick={() => {}} active />
    )
    expect(html).toContain('ring-2')
    expect(html).toContain('bg-[#fff8f8]')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter admin test StatCard
```

Expected: FAIL — the existing StatCard is a div and has no onClick/active props

- [ ] **Step 3: Implement the updated StatCard**

Replace the entire contents of `apps/admin/components/admin/StatCard.tsx`:

```tsx
interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: string
  onClick?: () => void
  active?: boolean
}

export function StatCard({ label, value, sub, accent, onClick, active }: Props) {
  const base =
    'bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-4'
  const activeClass = active ? ' ring-2 ring-[#800000]/30 bg-[#fff8f8]' : ''
  const clickableClass = onClick
    ? ' cursor-pointer hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] transition-shadow'
    : ''

  const inner = (
    <>
      <p className="text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-widest mb-2">
        {label}
      </p>
      <p className={`font-heading font-extrabold text-[2rem] leading-none tracking-tight mb-1 ${accent ?? 'text-[#1d1d1f]'}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#aeaeb2]">{sub}</p>}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base}${activeClass}${clickableClass} text-left w-full`}
      >
        {inner}
      </button>
    )
  }

  return <div className={`${base}${activeClass}`}>{inner}</div>
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter admin test StatCard
```

Expected: PASS (3 tests)

- [ ] **Step 5: Run all tests**

```bash
pnpm --filter admin test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add apps/admin/components/admin/StatCard.tsx apps/admin/components/admin/__tests__/StatCard.test.tsx
git commit -m "feat(admin): StatCard — clickable with active highlight state"
```

---

### Task 5: Export SyncLog + ListingTable controlled filter

**Files:**
- Modify: `apps/admin/components/admin/SyncPanel.tsx:3`
- Modify: `apps/admin/components/admin/ListingTable.tsx:22-23`
- Create: `apps/admin/components/admin/__tests__/ListingTable.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/admin/components/admin/__tests__/ListingTable.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))

import { ListingTable } from '../ListingTable'
import type { Listing } from '@iskotify/utils'

const active: Listing = {
  id: '1', type: 'scholarship', title: 'Active Scholarship', slug: 'a', provider: 'P1',
  description: '', requirements: [], coverage: '', deadline: null, exam_date: null,
  results_date: null, events: [], target_courses: [], target_year_levels: [], tags: [],
  status: 'active', region: '', grant_amount: null, external_url: '', image_url: '',
  created_at: '2024-01-01', updated_at: '2024-01-01',
}
const upcoming: Listing = { ...active, id: '2', title: 'Upcoming Exam', type: 'exam', status: 'upcoming' }

describe('ListingTable (controlled filter)', () => {
  it('shows only active listings when filter="Active"', () => {
    const html = renderToStaticMarkup(
      <ListingTable listings={[active, upcoming]} filter="Active" onFilterChange={() => {}} />
    )
    expect(html).toContain('Active Scholarship')
    expect(html).not.toContain('Upcoming Exam')
  })

  it('shows all listings when filter="All"', () => {
    const html = renderToStaticMarkup(
      <ListingTable listings={[active, upcoming]} filter="All" onFilterChange={() => {}} />
    )
    expect(html).toContain('Active Scholarship')
    expect(html).toContain('Upcoming Exam')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter admin test ListingTable
```

Expected: FAIL — `ListingTable` doesn't accept `filter` and `onFilterChange` props yet

- [ ] **Step 3: Export SyncLog from SyncPanel.tsx**

In `apps/admin/components/admin/SyncPanel.tsx`, change line 3 from:
```ts
interface SyncLog {
```
to:
```ts
export interface SyncLog {
```

- [ ] **Step 4: Update ListingTable to accept controlled filter props**

In `apps/admin/components/admin/ListingTable.tsx`, make these changes:

**4a.** Remove `useState` from the filter — keep useState for drawerListing and deleteTarget only.

Replace the function signature and filter state (lines 22–23):
```tsx
// BEFORE
export function ListingTable({ listings }: { listings: Listing[] }) {
  const [filter, setFilter] = useState('All')

// AFTER
export function ListingTable({ listings, filter, onFilterChange }: {
  listings: Listing[]
  filter: string
  onFilterChange: (f: string) => void
}) {
```

**4b.** Replace the one `setFilter(f)` call in the filter buttons (line 51):
```tsx
// BEFORE
onClick={() => setFilter(f)}

// AFTER
onClick={() => onFilterChange(f)}
```

The full updated `ListingTable.tsx` becomes:

```tsx
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

export function ListingTable({ listings, filter, onFilterChange }: {
  listings: Listing[]
  filter: string
  onFilterChange: (f: string) => void
}) {
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
        <div className="flex items-center gap-2 px-5 py-3 border-b border-black/[0.05] flex-wrap">
          <p className="font-heading font-bold text-[15px] text-[#1d1d1f] flex-1">Listings</p>
          {TYPE_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
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

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter admin test ListingTable
```

Expected: PASS (2 tests)

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter admin test
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/admin/SyncPanel.tsx apps/admin/components/admin/ListingTable.tsx apps/admin/components/admin/__tests__/ListingTable.test.tsx
git commit -m "refactor(admin): ListingTable accepts controlled filter props; export SyncLog type"
```

---

### Task 6: ListingsView client wrapper + page update

**Files:**
- Create: `apps/admin/components/admin/ListingsView.tsx`
- Create: `apps/admin/components/admin/__tests__/ListingsView.test.tsx`
- Modify: `apps/admin/app/admin/listings/page.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/admin/components/admin/__tests__/ListingsView.test.tsx`:

```tsx
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => '/admin/listings',
}))
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))

import { ListingsView } from '../ListingsView'
import type { Listing } from '@iskotify/utils'

const mockListings: Listing[] = []
const mockLogs: any[] = []
const health = { label: 'Healthy', accent: 'text-green-600' }

describe('ListingsView', () => {
  it('renders all four stat card labels', () => {
    const html = renderToStaticMarkup(
      <ListingsView
        listings={mockListings}
        logs={mockLogs}
        total={10}
        active={3}
        upcoming={2}
        lastSync={null}
        health={health}
      />
    )
    expect(html).toContain('Total Listings')
    expect(html).toContain('Active')
    expect(html).toContain('Upcoming')
    expect(html).toContain('Last Sync')
  })

  it('Total Listings stat card is active (ring class) in initial render', () => {
    const html = renderToStaticMarkup(
      <ListingsView
        listings={mockListings}
        logs={mockLogs}
        total={10}
        active={3}
        upcoming={2}
        lastSync={null}
        health={health}
      />
    )
    // Initial filter is 'All', so Total Listings card has active=true → ring-2 class
    expect(html).toContain('ring-2')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter admin test ListingsView
```

Expected: FAIL — `Cannot find module '../ListingsView'`

- [ ] **Step 3: Create ListingsView.tsx**

Create `apps/admin/components/admin/ListingsView.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import type { Listing } from '@iskotify/utils'
import type { SyncLog } from './SyncPanel'
import { StatCard } from './StatCard'
import { SyncPanel } from './SyncPanel'
import { ListingTable } from './ListingTable'

type Props = {
  listings: Listing[]
  logs: SyncLog[]
  total: number
  active: number
  upcoming: number
  lastSync: string | null
  health: { label: string; accent: string }
}

export function ListingsView({ listings, logs, total, active, upcoming, lastSync, health }: Props) {
  const [filter, setFilter] = useState('All')

  const lastSyncValue = lastSync
    ? new Date(lastSync).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Listings"
          value={total}
          onClick={() => setFilter('All')}
          active={filter === 'All'}
        />
        <StatCard
          label="Active"
          value={active}
          accent="text-green-700"
          sub="Open for applications"
          onClick={() => setFilter('Active')}
          active={filter === 'Active'}
        />
        <StatCard
          label="Upcoming"
          value={upcoming}
          accent="text-amber-700"
          sub="Opening soon"
          onClick={() => setFilter('Upcoming')}
          active={filter === 'Upcoming'}
        />
        <StatCard
          label="Last Sync"
          value={lastSyncValue}
          sub={health.label}
          accent={health.accent}
        />
      </div>
      <SyncPanel logs={logs} />
      <ListingTable listings={listings} filter={filter} onFilterChange={setFilter} />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm --filter admin test ListingsView
```

Expected: PASS (2 tests)

- [ ] **Step 5: Update listings/page.tsx to delegate to ListingsView**

Replace the entire contents of `apps/admin/app/admin/listings/page.tsx`:

```tsx
import { createServerClient } from '@iskotify/utils'
import type { Listing } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { ListingsView } from '@/components/admin/ListingsView'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const [listingsRes, logsRes] = await Promise.all([
    db.from('listings').select('*').order('created_at', { ascending: false }),
    db.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(4)
  ])
  return {
    listings: (listingsRes.data ?? []) as Listing[],
    logs: logsRes.data ?? []
  }
}

export default async function ListingsPage() {
  const { listings, logs } = await getData()

  const total = listings.length
  const active = listings.filter(l => l.status === 'active').length
  const upcoming = listings.filter(l => l.status === 'upcoming').length
  const lastSync = logs[0]?.created_at ?? null

  const health = (() => {
    if (!lastSync) return { label: 'Never synced', accent: 'text-gray-400' }
    const hrs = (Date.now() - new Date(lastSync).getTime()) / 3600_000
    if (hrs < 12) return { label: 'Healthy', accent: 'text-green-600' }
    if (hrs < 24) return { label: 'Stale', accent: 'text-amber-600' }
    return { label: 'Very stale', accent: 'text-red-600' }
  })()

  return (
    <>
      <Topbar title="All Listings" showSyncButton />
      <ListingsView
        listings={listings}
        logs={logs as any}
        total={total}
        active={active}
        upcoming={upcoming}
        lastSync={lastSync}
        health={health}
      />
    </>
  )
}
```

- [ ] **Step 6: Run all tests**

```bash
pnpm --filter admin test
```

Expected: all tests pass (109+ tests)

- [ ] **Step 7: Commit**

```bash
git add apps/admin/components/admin/ListingsView.tsx apps/admin/components/admin/__tests__/ListingsView.test.tsx apps/admin/app/admin/listings/page.tsx
git commit -m "feat(admin): ListingsView — clickable stat cards filter listings table"
```
