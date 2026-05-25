# PR 12C — Admin UX: Nav Cleanup, Skeleton Loading, Clickable Stat Cards

## Goal

Three focused improvements to the admin console: remove stale nav items, add skeleton loading with slide-up page transitions across all pages, and make listings stat cards clickable to filter the table in place.

## Architecture

**Nav cleanup:** One-line removal in `SidebarContent.tsx` — the LISTINGS section shrinks from 3 items to 1.

**Skeleton loading + animation:** `loading.tsx` files at each route segment give Next.js App Router a Suspense fallback to show while server pages fetch. A `PageTransition` client component wraps `{children}` in `AdminShell` and uses `key={pathname}` to re-mount on every navigation, triggering a `slideUp` CSS animation (8px translate + opacity, 200ms ease-out) defined in `tailwind.config.ts`.

**Clickable stat cards:** `ListingsPage` (server) computes stats and passes them to a new `ListingsView` client component. `ListingsView` owns the shared `filter` state used by both the stat cards and `ListingTable`. `ListingTable` becomes fully controlled (drops its internal `useState` for filter).

**Tech stack:** Next.js 15.5 App Router · React 19 · Tailwind 3.4 · Supabase SSR

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `components/admin/SidebarContent.tsx` | Modify | Remove Scholarships + Exams nav items |
| `tailwind.config.ts` | Modify | Add `slideUp` animation + keyframes |
| `components/admin/PageTransition.tsx` | Create | Client wrapper with `key={pathname}` for per-nav animation |
| `components/admin/AdminShell.tsx` | Modify | Wrap main content area with `<PageTransition>` |
| `app/admin/listings/loading.tsx` | Create | Listings skeleton: Topbar + 4 stat cards + table |
| `app/admin/sync/loading.tsx` | Create | Sync skeleton: Topbar + 4 log entry bars |
| `app/admin/flashcards/loading.tsx` | Create | Subjects skeleton: Topbar + 3 row bars |
| `app/admin/flashcards/subjects/[id]/loading.tsx` | Create | Subject detail skeleton: Topbar + breadcrumb + 3 rows |
| `app/admin/flashcards/subjects/[id]/cards/loading.tsx` | Create | Cards skeleton: Topbar + breadcrumb + 2 accordion bars |
| `app/admin/flashcards/upload/loading.tsx` | Create | Upload skeleton: Topbar + form block |
| `components/admin/StatCard.tsx` | Modify | Add `onClick?` + `active?` props; render as `<button>` when clickable |
| `components/admin/ListingsView.tsx` | Create | Client wrapper: owns `filter` state, renders stat cards + table |
| `app/admin/listings/page.tsx` | Modify | Pass computed stats + listings + logs to `<ListingsView>` |
| `components/admin/ListingTable.tsx` | Modify | Accept `filter` + `onFilterChange` as controlled props; remove internal useState |

---

## Section 1: Nav Cleanup

`SidebarContent.tsx` — the LISTINGS section becomes:

```ts
{
  section: 'LISTINGS',
  items: [
    { href: '/admin/listings', icon: '📋', label: 'All Listings' },
  ],
}
```

Removes the `?type=scholarship` and `?type=exam` filter shortcuts. Type filtering remains available via the table's built-in filter buttons.

---

## Section 2: Page Transition + Skeleton Loading

### `tailwind.config.ts`

Add to `theme.extend`:

```ts
animation: {
  slideUp: 'slideUp 0.2s ease-out',
},
keyframes: {
  slideUp: {
    '0%':   { opacity: '0', transform: 'translateY(8px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
},
```

### `PageTransition.tsx`

```tsx
'use client'
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

### `AdminShell.tsx`

Replace the bare `<div className="flex-1 flex flex-col overflow-hidden">` wrapper around `{children}` with `<PageTransition>`.

### Skeleton anatomy

All skeletons use `animate-pulse` with `bg-[#e5e7eb]` bars, matching the real page's spacing so content doesn't shift when it loads.

**Shared skeleton units (inline, no separate component needed):**
- `TopbarSkeleton`: `h-[52px] bg-white border-b border-black/[0.08]` with a `h-5 w-40 bg-[#e5e7eb] rounded-[10px]` title bar
- `ContentWrapper`: same `flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4` as real pages

**`listings/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  grid grid-cols-2 md:grid-cols-4 gap-4 → 4× StatCard-shaped blocks (h-24 rounded-[16px])
  SyncPanel-shaped block (h-16 rounded-[16px])
  Table block: header bar + 5× row bars
```

**`sync/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  4× log entry bars (h-16 rounded-[16px] bg-white)
```

**`flashcards/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  h-8 w-48 breadcrumb bar
  Table block: header + 3× row bars
```

**`flashcards/subjects/[id]/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  h-5 w-56 breadcrumb bar
  3× topic row bars (h-12 bg-white rounded-[16px])
```

**`flashcards/subjects/[id]/cards/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  h-5 w-64 breadcrumb bar
  2× accordion bars (h-14 bg-white rounded-[16px])
```

**`flashcards/upload/loading.tsx`:**
```
TopbarSkeleton
ContentWrapper:
  h-48 bg-white rounded-[16px] (upload form block)
```

---

## Section 3: Clickable Stat Cards

### `StatCard.tsx`

New props:

```tsx
interface Props {
  label: string
  value: string | number
  sub?: string
  accent?: string
  onClick?: () => void
  active?: boolean
}
```

When `onClick` is provided, render the card as `<button>` with:
- `cursor-pointer`
- `hover:shadow-[0_4px_16px_rgba(0,0,0,0.10)] transition-shadow`
- When `active`: add `ring-2 ring-[#800000]/30 bg-[#fff8f8]`

When no `onClick`, render as `<div>` (unchanged appearance).

### `ListingsView.tsx`

```tsx
'use client'

// Listing and SyncLog are both from '@iskotify/utils'
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

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Listings" value={total}
          onClick={() => setFilter('All')} active={filter === 'All'} />
        <StatCard label="Active" value={active} accent="text-green-700" sub="Open for applications"
          onClick={() => setFilter('Active')} active={filter === 'Active'} />
        <StatCard label="Upcoming" value={upcoming} accent="text-amber-700" sub="Opening soon"
          onClick={() => setFilter('Upcoming')} active={filter === 'Upcoming'} />
        <StatCard label="Last Sync"
          value={lastSync ? new Date(lastSync).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : '—'}
          sub={health.label} accent={health.accent} />
      </div>
      <SyncPanel logs={logs} />
      <ListingTable listings={listings} filter={filter} onFilterChange={setFilter} />
    </div>
  )
}
```

### `ListingTable.tsx`

Replace:
```tsx
export function ListingTable({ listings }: { listings: Listing[] }) {
  const [filter, setFilter] = useState('All')
```

With:
```tsx
export function ListingTable({ listings, filter, onFilterChange }: {
  listings: Listing[]
  filter: string
  onFilterChange: (f: string) => void
}) {
```

All existing references to `setFilter(f)` become `onFilterChange(f)`. No other changes needed.

### `ListingsPage` (server)

Pass computed stats + `SyncLog` type to `ListingsView`. Remove `StatCard` and `ListingTable` imports. Remove the `SyncPanel` render (it moves into `ListingsView`).

---

## Stat Card → Filter Mapping

| Card | filter value set |
|---|---|
| Total Listings | `'All'` |
| Active | `'Active'` |
| Upcoming | `'Upcoming'` |
| Last Sync | — (no onClick) |

The `'All'` filter shows all listings (including Closed), same as the existing "All" table button. The table filter buttons (`All`, `Scholarships`, `Exams`, `Active`, `Upcoming`, `Closed`) remain fully functional and update the same `filter` state, keeping stat card highlights in sync.

---

## Testing

- `StatCard.test.tsx` — renders as `div` by default; renders as `button` with onClick; applies `ring` class when `active`
- `ListingsView.test.tsx` — renders all four stat cards; renders ListingTable; stat card click sets filter (static render only, click tests need RTL)
- `ListingTable.test.tsx` — accepts controlled `filter` prop and renders only matching rows (static renderToStaticMarkup)

Existing `ListingTable` tests (if any) updated to pass `filter="All"` and `onFilterChange` props.

---

## Responsive Summary

| Feature | Mobile | Desktop |
|---|---|---|
| Nav cleanup | Affects mobile drawer | Affects desktop sidebar |
| Skeleton loading | Same loading.tsx used for both | Same |
| Stat cards | 2-col grid; all 4 cards clickable | 4-col grid |
| Slide-up animation | Same PageTransition | Same |
