# PR 12A — Admin Console: Responsive Layout + Drill-Down + View/Add UX (Design Spec)

**Date:** 2026-05-25
**App:** `apps/admin` (Next.js 15.5 App Router, React 19, Tailwind 3.4, Supabase SSR)
**Scope:** First sub-PR of the Admin Console overhaul. Makes the admin usable on phones/tablets, replaces the flat subjects table with proper drill-down (subject → topic → card), and lets admins add a topic to an existing subject or a card to an existing topic without re-uploading.
**Not in scope (deferred):** Edit/Delete UI for topics/cards (PR 12 later), pagination (PR 12B), data-structure sync audit between admin and mobile (PR 12C/D), sync logs visual overhaul.

---

## 1. Problem Statement

The admin console at `apps/admin` is desktop-only and flat:

- **Layout breaks on mobile.** `apps/admin/app/admin/layout.tsx:43` wraps everything in `flex h-screen overflow-hidden bg-[#f5f5f7]` with a 220px fixed-width sidebar (`apps/admin/components/admin/Sidebar.tsx:52` — `w-[220px] flex-shrink-0`). Below `md`, the sidebar eats nearly half the screen, the content area overflows horizontally, and the Topbar (`apps/admin/components/admin/Topbar.tsx:10` — `px-6 h-[52px]`) gives no way to hide/show the sidebar.
- **Tables don't reflow.** `ListingTable.tsx` and `flashcards/page.tsx` render raw `<table>` elements with `px-5 py-3` cells and `text-[10px–13px]` text. On phones, columns truncate or force horizontal scroll, and the filter chip row wraps unpredictably.
- **Stat grid is fixed at 4 columns.** `listings/page.tsx:44` uses `grid-cols-4`; on phones the cards become 40px-wide slivers.
- **No drill-down for flashcards.** `flashcards/page.tsx` shows one row per subject with topic count and card count, but there is no way to click into a subject to see its topics, and no way to click into a topic to see its cards. The only add-content path is `/admin/flashcards/new` (`flashcards/new/page.tsx`) which always creates a *new* subject + *new* topic + a batch of cards in one form. There is no "add topic to existing subject" or "add card to existing topic."

This blocks two real workflows: (1) admin team using a phone to spot-check data, (2) admin adding one card to a topic without re-running the whole bulk form.

---

## 2. Goals

1. **Mobile-usable layout.** Sidebar collapses into a hamburger-triggered drawer below `md` (768px). Content area uses responsive padding and stack-on-mobile grids. No horizontal page scroll on phones (375px wide minimum target).
2. **Drill-down navigation for flashcards.** `/admin/flashcards` lists subjects → click a subject → `/admin/flashcards/subjects/[id]` shows that subject's topics → click a topic → `/admin/flashcards/topics/[id]` shows that topic's cards. Back button works. URLs are bookmarkable.
3. **In-context add.** Subject detail page has "+ Add Topic" button (opens modal, creates topic in *this* subject). Topic detail page has "+ Add Card" button (opens modal, creates card in *this* topic). The existing `/admin/flashcards/new` bulk form is kept as-is for first-time subject creation.
4. **Tables degrade to cards on mobile.** Each row becomes a vertically-stacked card below `md`, with the same data, no horizontal scroll.

Non-goals (explicit):
- Edit/delete buttons for topics or cards. Listings already have edit/delete; flashcards intentionally don't get them in this PR.
- Pagination. Current data volumes (≤ ~50 subjects, ≤ ~10 topics each, ≤ ~30 cards each) fit a single page. Pagination lands in PR 12B.
- Reworking the sync logs panel or upload flow.
- Changing any database schema or any mobile-app code.

---

## 3. Architecture Overview

Two architectural moves, both local to `apps/admin`:

**A. Shell becomes a client wrapper.** A new client component `AdminShell.tsx` holds drawer open/close state. It renders `Sidebar` (desktop, always visible) + `MobileSidebar` (a `md:hidden` slide-in panel that wraps the same `Sidebar` content) + the topbar slot + the children. `app/admin/layout.tsx` becomes: auth gate (server) → `<AdminShell userEmail={...}>{children}</AdminShell>` (client wraps the rest).

**B. Drill-down via real routes, not accordion.** New folders:
```
app/admin/flashcards/subjects/[id]/page.tsx   ← lists topics in a subject
app/admin/flashcards/topics/[id]/page.tsx     ← lists cards in a topic
```
Both are server components (`dynamic = 'force-dynamic'`) that fetch their data via `createServerClient()` from `@iskotify/utils`. Add-topic and add-card use client-component modals that POST to new API routes and call `router.refresh()` on success.

The flat subjects table at `/admin/flashcards` becomes a list of clickable subject rows (link wraps the row). No accordion, no inline expand.

---

## 4. Component & File Map

### 4.1 Modify (existing files)

| File | Change |
|---|---|
| `apps/admin/app/admin/layout.tsx` | Replace `<div className="flex h-screen overflow-hidden ..."><Sidebar /><div ...>{children}</div></div>` with `<AdminShell userEmail={user.email ?? ''}>{children}</AdminShell>`. Keep the 403 branch and the auth/role checks unchanged. |
| `apps/admin/components/admin/Sidebar.tsx` | Refactor: extract the body (header + nav + footer) into `SidebarContent.tsx` (new file in §4.2). `Sidebar.tsx` becomes a thin desktop-only wrapper: `<aside className="hidden md:flex w-[220px] flex-shrink-0 bg-[#1d1d1f] flex-col h-full"><SidebarContent userEmail={userEmail} /></aside>`. `usePathname` stays inside `SidebarContent`. |
| `apps/admin/components/admin/Topbar.tsx` | Accept new optional `onMenuClick?: () => void` prop. When provided, render a `md:hidden` hamburger button on the left of the title that calls it. Title text size becomes `text-[15px] md:text-[17px]`. Padding becomes `px-4 md:px-6`. |
| `apps/admin/app/admin/flashcards/page.tsx` | Wrap each subject row in `<Link href={`/admin/flashcards/subjects/${subject.id}`}>` so it drills down. Add hover style. Keep the existing topic-count and card-count columns (so keep the nested `flashcards (id, status)` query — counts are aggregated here, the *list* of cards lives on the topic detail page). Add mobile card layout (see §5). Keep the listing-level status badge logic. |
| `apps/admin/app/admin/listings/page.tsx` | Stat grid: `grid-cols-4` → `grid-cols-2 md:grid-cols-4`. Outer container `p-6` → `p-3 sm:p-4 md:p-6`. (Listings table responsive comes from updating `ListingTable.tsx`.) |
| `apps/admin/components/admin/ListingTable.tsx` | Add `md:hidden` card layout (vertical stacked cards with title + provider + badges + dates + edit/delete buttons). Keep existing `<table>` block but wrap it in `hidden md:block`. The filter chip row stays the same (already uses `flex-wrap`). |
| `apps/admin/app/admin/sync/page.tsx` | Padding `p-6` → `p-3 sm:p-4 md:p-6`. No other changes. |
| `apps/admin/app/admin/page.tsx` | Padding `p-6` → `p-3 sm:p-4 md:p-6`. No other changes. |

### 4.2 Create (new files)

| File | Purpose |
|---|---|
| `apps/admin/components/admin/AdminShell.tsx` | Client component. Holds `drawerOpen` useState. Renders Sidebar (desktop), MobileSidebar (drawer), and `{children}`. Provides `onMenuClick={() => setDrawerOpen(true)}` to whatever Topbar each page renders via React Context (new `AdminDrawerContext`) so pages don't have to thread the prop. |
| `apps/admin/components/admin/MobileSidebar.tsx` | Client component. `md:hidden` fixed-position drawer: dark overlay (`bg-black/50`) + slide-in panel from the left (`w-[280px]`) containing the same nav as `Sidebar.tsx`. To avoid duplication, refactor: extract `SidebarContent` (just the nav body) and have both `Sidebar.tsx` and `MobileSidebar.tsx` render it. Close on overlay click, on Escape key, and on route change (`usePathname` effect). |
| `apps/admin/components/admin/SidebarContent.tsx` | Pure presentation. Receives `userEmail` and `onItemClick?: () => void`. Renders the brand header, nav sections, user footer + sign-out. The two sidebars (desktop and mobile-drawer) both render this. |
| `apps/admin/contexts/AdminDrawerContext.tsx` | Tiny React context: `{ openDrawer: () => void }`. Provided by `AdminShell`, consumed by `Topbar` (or by any page that wants to render its own topbar). |
| `apps/admin/app/admin/flashcards/subjects/[id]/page.tsx` | Server component. Fetches subject `{ id, name }` and its topics `{ id, name, status, flashcards (id) }` from Supabase. Renders Topbar with the subject name as title and a breadcrumb (`Subjects / <name>`), an "+ Add Topic" button, and a topic table (desktop) / card list (mobile). Each topic row links to `/admin/flashcards/topics/${topic.id}`. Returns Next.js `notFound()` if subject doesn't exist. |
| `apps/admin/app/admin/flashcards/topics/[id]/page.tsx` | Server component. Fetches topic `{ id, name, status, subject_id }`, the parent subject `{ id, name }`, and the topic's cards `{ id, question, answer, explanation }`. Renders Topbar with breadcrumb (`Subjects / <subject> / <topic>`), "+ Add Card" button, and the card list (desktop table / mobile cards). Returns `notFound()` if topic missing. |
| `apps/admin/components/admin/AddTopicModal.tsx` | Client component. Props: `subjectId`, `onClose`. Form: topic name input + Save button. On submit: `POST /api/flashcards/topics` with `{ subject_id, name, status: 'published' }`. On success: `router.refresh()` + `onClose()`. Reuses the styling pattern from `ListingDrawer.tsx`. |
| `apps/admin/components/admin/AddCardModal.tsx` | Client component. Props: `topicId`, `topicStatus: 'published' \| 'draft'`, `onClose`. Form: question, answer, explanation (textareas). On submit: `POST /api/flashcards/cards` with `{ topic_id, question, answer, explanation, status: topicStatus }` (so a new card inherits the topic's publish state — adding to a draft topic shouldn't accidentally surface the card in the mobile app). On success: refresh + close. |
| `apps/admin/components/admin/Breadcrumb.tsx` | Pure component. Receives an array `[{ label, href? }]`. Renders `Subjects / Math / Algebra` with separator dots and last item bold. Used by both drill-down pages. |
| `apps/admin/app/api/flashcards/topics/route.ts` | `POST` handler. Body: `{ subject_id: string, name: string, status?: 'published' \| 'draft' }`. Validates required fields, inserts into `flashcard_topics`, returns `{ id }`. Errors → 400/500. |
| `apps/admin/app/api/flashcards/cards/route.ts` | **Extend the existing file** to add a `POST` handler. Body: `{ topic_id: string, question: string, answer: string, explanation?: string, status?: 'published' \| 'draft', listing_slugs?: string[] }`. If `listing_slugs` is omitted, copy from another card in the same topic (so a manually added card joins the same exam listings). Inserts and returns `{ id }`. Keep the existing `GET` handler unchanged. |

### 4.3 Test files (created alongside)

| File | Purpose |
|---|---|
| `apps/admin/components/admin/__tests__/SidebarContent.test.tsx` | Renders nav sections; verifies active-route highlighting via `pathname`. |
| `apps/admin/components/admin/__tests__/MobileSidebar.test.tsx` | Verifies opens/closes via prop; verifies overlay click closes; verifies Escape key closes. |
| `apps/admin/components/admin/__tests__/AdminShell.test.tsx` | Verifies drawer state is shared via context; clicking a Topbar-rendered menu button opens it. |
| `apps/admin/components/admin/__tests__/Breadcrumb.test.tsx` | Renders items; last item not a link. |
| `apps/admin/components/admin/__tests__/AddTopicModal.test.tsx` | Submit POSTs to `/api/flashcards/topics` with the right body; empty name disables submit. |
| `apps/admin/components/admin/__tests__/AddCardModal.test.tsx` | Submit POSTs to `/api/flashcards/cards` with the right body; empty question/answer disable submit. |
| `apps/admin/app/api/flashcards/topics/__tests__/route.test.ts` | POST happy path; missing `subject_id` → 400; missing `name` → 400. |
| `apps/admin/app/api/flashcards/cards/__tests__/route.test.ts` | POST happy path with `listing_slugs`; POST happy path *without* `listing_slugs` (inherits from sibling); missing `topic_id` → 400. |

---

## 5. Responsive Design Rules

Concrete Tailwind rules. The implementer should follow these exactly — don't invent new breakpoints or padding scales.

### 5.1 Breakpoints

Use Tailwind defaults: `sm` = 640px, `md` = 768px, `lg` = 1024px. The mobile/desktop divide is `md` — sidebar hides, hamburger appears, tables become cards.

### 5.2 Padding scale

Replace every `p-6` on top-level content containers with `p-3 sm:p-4 md:p-6`. Same for `px-6` on the Topbar: `px-4 md:px-6`.

### 5.3 Grid scale

`grid-cols-4` on StatCard grids → `grid-cols-2 md:grid-cols-4`.

### 5.4 Table → card pattern

For each table that needs mobile fallback, render **two trees**:

```tsx
{/* Desktop: real table */}
<div className="hidden md:block bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
  <table className="w-full text-sm"> ... </table>
</div>

{/* Mobile: card list */}
<div className="md:hidden space-y-2">
  {rows.map(row => (
    <div key={row.id} className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
      <p className="font-medium text-[#1d1d1f]">{row.title}</p>
      <p className="text-xs text-[#6e6e73]">{row.subtitle}</p>
      <div className="flex gap-2 mt-2">{badges}</div>
    </div>
  ))}
</div>
```

For clickable rows (subjects, topics): wrap the entire card / `<tr>` in a `<Link>` (Next.js — server components can render `Link`). The mobile card variant uses a chevron `›` on the right to signal tappability.

### 5.5 Drawer specifics

`MobileSidebar` is mounted but `pointer-events-none` + `opacity-0` when closed (so transitions work):

```tsx
<div className={`md:hidden fixed inset-0 z-50 transition-opacity ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
  <div onClick={onClose} className="absolute inset-0 bg-black/50" />
  <aside className={`absolute left-0 top-0 bottom-0 w-[280px] bg-[#1d1d1f] flex flex-col transition-transform ${open ? 'translate-x-0' : '-translate-x-full'}`}>
    <SidebarContent userEmail={userEmail} onItemClick={onClose} />
  </aside>
</div>
```

Body scroll lock while open: in `MobileSidebar`, add `useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = '' } }, [open])`.

Close triggers:
- Click on overlay
- Press Escape (window keydown listener while open)
- Route change (`usePathname` changes → call `onClose()`)

### 5.6 Hamburger button

Inside `Topbar.tsx`, when the context provides `openDrawer`, render:

```tsx
<button
  onClick={openDrawer}
  aria-label="Open menu"
  className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center hover:bg-[#f5f5f7] -ml-1.5"
>
  <span className="text-xl">☰</span>
</button>
```

Place it before the title in the flex row. Topbar already uses `flex items-center justify-between`; insert the menu button + title together in a `flex items-center gap-2`.

---

## 6. Drill-Down Pages — Concrete Layout

### 6.1 `/admin/flashcards` (existing, modified)

Same Topbar. Subject list. Each row links to `/admin/flashcards/subjects/${id}`. Desktop columns: Subject, Topics, Cards, Status. Mobile cards: `name (bold) / X topics · Y cards / status badge / › chevron`. The two top-right buttons (`+ Add manually`, `Upload PDF`) stay.

Note: `+ Add manually` still goes to `/admin/flashcards/new` (the existing bulk form). That form is unchanged in this PR.

### 6.2 `/admin/flashcards/subjects/[id]` (new)

- Topbar title: `<subject.name>`
- Below topbar: Breadcrumb `Subjects / <subject.name>` (the "Subjects" link goes back to `/admin/flashcards`).
- Right side of content header: `+ Add Topic` button (opens `AddTopicModal`).
- Table (desktop) / card list (mobile) of topics. Desktop columns: Topic, Cards, Status. Mobile cards: `name (bold) / X cards / status badge / › chevron`.
- Each topic row links to `/admin/flashcards/topics/${topicId}`.
- Empty state: "No topics yet. Add the first topic →" (calls the same modal).

### 6.3 `/admin/flashcards/topics/[id]` (new)

- Topbar title: `<topic.name>`
- Breadcrumb: `Subjects / <subject.name> / <topic.name>`.
- Right side: `+ Add Card` button (opens `AddCardModal`).
- Card list (this is *flashcards*, plural, not card-style layout): each row shows the question (first line) + answer preview (truncated 80 chars). Desktop = table with columns Question / Answer / Explanation. Mobile = stacked panel with question (bold) + answer (gray) + explanation (full text shown below in smaller, lighter gray; no collapse/expand).
- No edit/delete buttons in this PR.
- Empty state: "No cards in this topic yet. Add the first card →".

---

## 7. API Routes — Concrete Contracts

### 7.1 `POST /api/flashcards/topics` (new)

**Request body:**
```json
{
  "subject_id": "uuid",
  "name": "Algebra Basics",
  "status": "published"   // optional, defaults to "published"
}
```

**Validation:**
- `subject_id` required, non-empty string. 400 if missing.
- `name` required, trimmed length ≥ 1. 400 if missing.
- `status` optional, must be `"published"` or `"draft"` if provided.

**Behavior:** Insert one row into `flashcard_topics`. Returns `{ id: <newTopicId> }`. On Supabase error, log and return 500.

### 7.2 `POST /api/flashcards/cards` (extend existing GET handler)

**Request body:**
```json
{
  "topic_id": "uuid",
  "question": "What is 2+2?",
  "answer": "4",
  "explanation": "Basic addition.",   // optional, defaults to ""
  "status": "published",              // optional, defaults to "published"
  "listing_slugs": ["upcat-2026"]     // optional
}
```

**Validation:**
- `topic_id` required → 400 if missing.
- `question` required → 400 if missing.
- `answer` required → 400 if missing.
- `status` optional, must be `"published"` or `"draft"`.

**Behavior:**
1. If `listing_slugs` is provided and non-empty, use it directly.
2. Else, look up an existing card in the same topic (`select listing_slugs from flashcards where topic_id = ? limit 1`). If found, copy its `listing_slugs`. This keeps new cards aligned to the same exam listings as their siblings.
3. Else (topic has no cards yet and no `listing_slugs` provided), fall back to `[]`. The card will not surface in any mobile listing decks until an admin attaches slugs via the upload flow.
4. Insert the card with the resolved `listing_slugs`. Return `{ id }`.

### 7.3 Existing routes untouched

- `GET /api/flashcards/cards?topic_id=...` — unchanged.
- `GET /api/flashcards/subjects/[id]` — unchanged.
- `GET /api/flashcards/topics/[id]` — unchanged.
- All other routes unchanged.

---

## 8. Testing Strategy

**Unit (Vitest, jsdom):**
- `SidebarContent`, `MobileSidebar`, `AdminShell`, `Breadcrumb`, `AddTopicModal`, `AddCardModal` — render, interaction (clicks, Escape key, form submit).
- API route handlers: standard pattern from existing tests (mock `createServerClient`, exercise `POST` paths). Existing admin tests live next to the routes (`apps/admin/app/api/flashcards/.../__tests__/...`); follow that pattern.

**Manual on Vercel preview (each PR push gets one):**
- Open preview URL on a phone (or Chrome devtools mobile emulator at 375×812).
- Sign in as admin.
- Verify: hamburger opens drawer, drawer closes on overlay tap / Escape / route change.
- Verify: Listings page shows 2-up stat cards, listings show as vertical cards (not table) below `md`, no horizontal page scroll.
- Verify: Click a subject → lands on subject detail → click "+ Add Topic" → fill name → save → topic appears in list.
- Verify: Click that new topic → lands on topic detail → "+ Add Card" → fill q+a → save → card appears.
- Verify: Back button returns to subject detail, then to subjects list.
- Verify: At desktop ≥ `md`, sidebar is visible, drawer is hidden, hamburger is hidden, layouts unchanged from before.

**No mobile-app code changes**, so no mobile build needed.

---

## 9. Rollout

- Branch off master, single PR. CI: `cd apps/admin && pnpm test` + `pnpm build` must pass.
- Vercel auto-deploys preview on push. Manual mobile-emulator check on the preview URL before merge.
- On merge to master, Vercel auto-deploys to production admin.
- Zero database migrations. No mobile OTA. No native rebuild.

---

## 10. Risks and Open Questions

**Risks:**

1. **Sidebar refactor regression.** Extracting `SidebarContent` from `Sidebar.tsx` could break active-route highlighting if `usePathname` is moved to the wrong level. Mitigation: keep `usePathname` inside `SidebarContent` (it's `'use client'`), don't pass `pathname` as a prop.
2. **Mobile table-to-card duplication.** Maintaining two render trees per table doubles the risk of drift (a column gets added on desktop but not on mobile). Mitigation: for the four affected tables in this PR (listings, subjects, topics, cards), the schemas are tiny and stable; if more tables appear later, factor out a `ResponsiveTable` helper. Not worth it now.
3. **`listing_slugs` inheritance for manually added cards.** The fallback (copy from a sibling card) is correct for most cases but breaks if siblings have inconsistent slugs across the topic. Acceptable — the existing schema already allows that drift, this PR doesn't introduce new drift.
4. **No edit/delete in this PR.** Admin who adds a wrong topic or card via the new modals has no in-UI way to fix it; they'd need direct DB access or wait for PR 12 follow-up. Acceptable for now since the new modals are gated on admin-only routes and topics/cards can be republished from the upload flow.

**Open questions (resolved):**

- Q: Drawer or bottom-tab nav on mobile? **A: Drawer** (matches existing dark sidebar aesthetic, and bottom tabs would conflict with the admin's 3-section nav).
- Q: Drill-down via routes or accordion? **A: Routes** (bookmarkable, back button works, easier to paginate later, less client state).
- Q: Edit/Delete in scope? **A: No** (kept out to keep PR small; tracked for a follow-up).
- Q: Pagination in scope? **A: No** (PR 12B handles it once we have enough rows to require it).

---

## 11. Out of Scope (Captured for Future PRs)

- **PR 12B — Pagination.** Server-side cursor pagination for listings, subjects, topics, cards. Search/filter inputs at top of each list. Wire `limit + offset` (or `range`) into the Supabase queries.
- **PR 12C — Add-data UX polish.** Inline edit/delete on each list, "Move card to topic" affordance, bulk select, undo.
- **PR 12D — Data-structure sync audit.** Walk the admin schema (`listings`, `flashcard_subjects`, `flashcard_topics`, `flashcards`, `listing_slugs`) vs. the mobile DB schema (Drizzle) and pull/push pathways; document any drift; fix.
- Sync logs panel restyle.
- Theming / dark mode.
