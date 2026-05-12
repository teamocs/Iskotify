# Sprint 2 Design Spec — Landing Page & Admin CMS

**Date:** 2026-05-12  
**Author:** chrisraro  
**Status:** Approved — ready for implementation

---

## 1. Scope

Sprint 2 (part A) delivers two surfaces inside a single `apps/admin` Next.js 15 App Router application:

1. **Public Landing Page** (`/`) — Card-grid listing of scholarships and exams pulled from Supabase, visible to all visitors.
2. **Admin CMS** (`/admin/*`) — Sidebar + list management interface for listings, sync controls, and sync logs. Protected by middleware cookie check.

Sprint 2B (PDF → flashcard pipeline via Claude API) is a separate spec and will follow after this is shipped.

---

## 2. Architecture

### 2.1 App Structure

Single Next.js 15 App Router app. No separate frontend repo.

```
apps/admin/
├── app/
│   ├── layout.tsx              # root layout — fonts, global CSS
│   ├── globals.css             # design tokens, Tailwind base
│   ├── page.tsx                # public landing page (/)
│   ├── admin/
│   │   ├── layout.tsx          # admin shell — sidebar + topbar
│   │   ├── page.tsx            # redirect → /admin/listings
│   │   ├── listings/
│   │   │   └── page.tsx        # listing table + filters
│   │   ├── sync/
│   │   │   └── page.tsx        # sync log full view
│   │   └── login/
│   │       └── page.tsx        # password gate UI
│   ├── api/
│   │   └── sheets/
│   │       └── sync/
│   │           └── route.ts    # already implemented
├── components/
│   ├── landing/
│   │   ├── Nav.tsx
│   │   ├── Hero.tsx
│   │   ├── FilterBar.tsx
│   │   ├── ListingCard.tsx
│   │   └── KuyaBawCTA.tsx
│   └── admin/
│       ├── Sidebar.tsx
│       ├── Topbar.tsx
│       ├── StatCard.tsx
│       ├── SyncPanel.tsx
│       └── ListingTable.tsx
├── middleware.ts               # admin route protection
└── public/
    ├── logo.svg
    └── kuya-baw-mascot.svg
```

### 2.2 Rendering Strategy

| Route | Strategy | Reason |
|---|---|---|
| `/` | Server Component + `revalidate: 3600` | Public, SEO-relevant, can be stale by 1h |
| `/admin/listings` | Server Component, no cache | Always shows live DB state |
| `/admin/sync` | Server Component, no cache | Log freshness matters |

No client components unless interaction is required (filter pills, sync button trigger).

---

## 3. Design System

### 3.1 Typography

Loaded via Google Fonts in `app/layout.tsx`:

```html
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Lexend:wght@300;400;500;600&display=swap" rel="stylesheet">
```

| Role | Font | Weight |
|---|---|---|
| Headings, brand, numbers | Outfit | 600 – 900 |
| Body, labels, UI text | Lexend | 300 – 600 |
| Monospace (logs, code) | system-mono (fallback) | — |

Applied via CSS variables on `:root` and Tailwind `fontFamily` extension:
- `font-heading` → `'Outfit', sans-serif`
- `font-body` → `'Lexend', -apple-system, sans-serif`

### 3.2 Color Tokens

```css
:root {
  --maroon:       #800000;
  --maroon-light: #a00000;
  --maroon-dim:   rgba(128,0,0,0.08);
  --maroon-mid:   rgba(128,0,0,0.15);

  --surface:      #ffffff;
  --surface-2:    #f5f5f7;
  --surface-3:    #fafafa;
  --sidebar-bg:   #1d1d1f;

  --border:       rgba(0,0,0,0.08);
  --border-light: rgba(0,0,0,0.05);

  --text-primary:   #1d1d1f;
  --text-secondary: #6e6e73;
  --text-tertiary:  #aeaeb2;
}
```

Extended in `tailwind.config.ts` as named tokens so they're available as `bg-maroon`, `text-maroon`, `bg-surface-2`, etc.

### 3.3 Radius & Shadow Tokens

| Token | Value | Used for |
|---|---|---|
| `--radius-sm` | 10px | Badges, small chips |
| `--radius-md` | 16px | Cards, panels |
| `--radius-lg` | 22px | Large cards, hero elements |
| `--radius-pill` | 980px | Filter pills, CTA buttons |
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,0.06)` | Nav, flat cards |
| `--shadow-card` | `0 8px 32px rgba(0,0,0,0.06)` | Listing cards |

### 3.4 iOS/Apple Design Principles Applied

- **Frosted glass nav:** `background: rgba(255,255,255,0.82); backdrop-filter: blur(20px) saturate(180%)`
- **Hover lift on cards:** `transform: translateY(-3px); box-shadow: var(--shadow-md)` at 180ms ease
- **Pill-shaped CTAs:** `border-radius: 980px` for primary action buttons
- **Typography hierarchy:** Large Outfit 800 display text → Lexend 400 body — same contrast ratio pattern as apple.com
- **Generous whitespace:** Padding/gap at 1.5rem base, not 1rem

---

## 4. Public Landing Page (`/`)

### 4.1 Sections

1. **Nav** — Sticky frosted glass. Logo left, "Scholarships / Exams / Get the App" right.
2. **Hero** — Maroon gradient background, Outfit 800 headline, tagline, two pill CTAs ("Browse Scholarships", "Download App"). Kuya Baw emoji watermark at 15% opacity.
3. **Filter bar** — Segmented-control-style pills: All | Scholarships | Exams | Nationwide | NCR. Search box right-aligned. Client component for filter state.
4. **Card grid** — 3-column grid (responsive: 1col mobile, 2col tablet, 3col desktop). Each card: gradient cover image, type badge, status badge, title, org, key detail line, deadline/CTA.
5. **Kuya Baw CTA** — Bottom section promoting the mobile app AI companion. Mascot image + description + "Download Free →" button.

### 4.2 Listing Card States

| Status | Status badge | CTA text |
|---|---|---|
| `active` | Green "ACTIVE" | Apply → |
| `upcoming` | Amber "UPCOMING" | Notify → |
| `closed` | Grey "CLOSED" | View → |

Type badge colors:
- `scholarship` → maroon-tinted (`#fef2f2` bg, `#800000` text)
- `exam` → blue-tinted (`#eff6ff` bg, `#1e3a8a` text)

### 4.3 Data Fetching

```typescript
// app/page.tsx
export const revalidate = 3600

async function getListings() {
  const supabase = createServerClient()
  const { data } = await supabase
    .from('listings')
    .select('id, title, slug, type, status, organization, region, stipend, deadline_at, opens_at')
    .neq('status', 'closed')
    .order('deadline_at', { ascending: true })
  return data ?? []
}
```

Filter pill interactions (type, region) are handled client-side in a `FilterBar` Client Component that receives the full listing array as a prop and filters in memory — no re-fetch on filter change.

### 4.4 Empty State

If no listings are returned from Supabase, render a centered empty state with Kuya Baw mascot and copy: "No listings yet — check back soon."

---

## 5. Admin CMS (`/admin/*`)

### 5.1 Route Protection — Middleware

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/admin')) {
    if (request.nextUrl.pathname === '/admin/login') return NextResponse.next()
    const cookie = request.cookies.get('ADMIN_SECRET')
    if (cookie?.value !== process.env.ADMIN_SECRET) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }
  return NextResponse.next()
}

export const config = { matcher: ['/admin/:path*'] }
```

`/admin/login` accepts a password form that POSTs to an API route (`POST /api/admin/login`). On correct password it sets the `ADMIN_SECRET` cookie (httpOnly, sameSite strict) and redirects to `/admin/listings`.

`ADMIN_SECRET` is a plain string in `.env.local` — no Supabase auth for MVP.

### 5.2 Admin Shell Layout

`app/admin/layout.tsx` renders a full-height flex container:

- **Left: `<Sidebar />`** — fixed width 220px, `bg-[#1d1d1f]` (dark), always visible
- **Right: flex-col** — `<Topbar />` (sticky frosted) + scrollable `{children}`

### 5.3 Sidebar

Sections and nav items:

```
Iskotify (brand + admin label)
────────────────────────────
LISTINGS
  📋 All Listings      [count badge]
  🎓 Scholarships      [count badge]
  📝 Exams             [count badge]
SYNC
  🔄 Google Sheets
  📄 Sync Logs
FLASHCARDS  ← stub nav items for Sprint 2B
  🃏 Subjects
  📚 Upload PDF
────────────────────────────
[avatar] chrisraro / Super Admin
```

Active nav item: `background: rgba(255,255,255,0.1)`, white text, maroon badge.

Counts are fetched server-side in `app/admin/listings/page.tsx` via a single Supabase aggregation query and passed as props.

### 5.4 Listings Page (`/admin/listings`)

**Topbar actions:** "Export CSV" (secondary) · "Sync Now" (maroon pill) · "Add Listing" (dark pill)

**Stat row (4 cards):**
- Total listings count
- Active count
- Upcoming count
- Last sync timestamp + health dot (green = last sync < 12h ago, amber = 12–24h, red = > 24h)

**Sync panel (collapsed inline log):**
- Title: "Google Sheets Sync" + last run time
- Health status dot + label
- Last 4 sync log entries with OK / WARN / ERR badges
- "View full log →" link to `/admin/sync`

**Listing table:**

Columns: Name + Org | Type | Status | Region | Deadline | Actions

Filter pills above table: All | Scholarships | Exams | Active | Upcoming | Closed (client-side filter, same pattern as landing)

Row actions: Edit (opens slide-over drawer) · Delete (confirmation dialog)

### 5.5 Sync Log Data

Sync results are currently returned in the API response body (`{ synced, skipped, closed }`). For Sprint 2, we add a `sync_logs` table to persist them.

**Migration (Sprint 2 migration file):**

```sql
create table sync_logs (
  id          bigint generated always as identity primary key,
  synced      int not null default 0,
  skipped     int not null default 0,
  closed      int not null default 0,
  status      text not null default 'ok',   -- 'ok' | 'warn' | 'error'
  message     text,
  created_at  timestamptz not null default now()
);
```

After each sync (success or error) the route writes one row to `sync_logs`. Status is `'warn'` if `skipped > 0`, `'error'` if the route returns a 500.

### 5.6 "Sync Now" Button

The "Sync Now" button in the topbar is a Client Component that:
1. Calls `POST /api/sheets/sync` with `Authorization: Bearer <SYNC_SECRET>` (secret read via a Server Action or dedicated route to avoid exposing it client-side)
2. Shows a spinner while in-flight
3. On success: shows toast "Synced X listings" + revalidates `/admin/listings` path via `router.refresh()`
4. On error: shows error toast

### 5.7 Add / Edit Listing

A slide-over drawer (`<ListingDrawer />`) with a form. Fields map 1:1 to the `listings` table columns defined in Sprint 1 schema. On submit: calls `POST /api/admin/listings` (create) or `PATCH /api/admin/listings/[id]` (update). On success: closes drawer + `router.refresh()`.

Delete: shows a `<ConfirmDialog />` with "This cannot be undone." On confirm: calls `DELETE /api/admin/listings/[id]`.

---

## 6. Supabase Client Usage

Server components and API routes use the service-role client from `packages/utils`:

```typescript
import { createServerClient } from '@iskotify/utils'
```

No Supabase auth session management in Sprint 2. RLS policies on listings are permissive for `service_role` (already configured in Sprint 1 migration). Public read queries (`/`) use the anon key client — RLS SELECT policy on listings allows anon reads.

---

## 7. Environment Variables

No new public env vars. New server-only vars:

```
ADMIN_SECRET=<any-strong-string>   # cookie value for admin gate
```

Already present:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SYNC_SECRET=...
```

---

## 8. Error Handling

| Scenario | Behaviour |
|---|---|
| Supabase unreachable on landing page | Return empty listings array; render empty state — no crash |
| Supabase unreachable in admin | Show error banner in stat cards area; table shows 0 rows |
| Sync Now fails (non-200) | Error toast with message from response body |
| Middleware env var missing | `ADMIN_SECRET` unset → middleware blocks all `/admin/*` with 500 + console.error |
| Add/edit API error | Form shows inline error; no drawer close |

---

## 9. New Migration

Sprint 2 adds one migration file:

```
supabase/migrations/002_sync_logs.sql
```

Adds the `sync_logs` table (defined in §5.5). Applied to `dtugrsbarruizgzowgso` via Supabase MCP before deploying.

---

## 10. Out of Scope (Sprint 2A)

- Mobile app (Sprint 3)
- PDF → flashcard pipeline (Sprint 2B, separate spec)
- User-facing auth (login for students, saved listings)
- Push notifications
- i18n / Tagalog copy
- Analytics

---

## 11. Success Criteria

- `/` renders scholarship/exam cards from live Supabase data; filter pills work client-side
- `/admin/listings` shows stat cards, sync log, and listing table — all from live DB
- "Sync Now" triggers the existing route and shows toast feedback
- Add / Edit / Delete all persist to Supabase and reflect immediately on refresh
- `/admin/*` redirects to `/admin/login` when cookie is absent
- Design matches approved Apple/iOS mockups: Outfit + Lexend, maroon brand, frosted nav, pill CTAs, 22px card radius
