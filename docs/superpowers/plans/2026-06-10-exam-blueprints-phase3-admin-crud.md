# Exam Blueprints — Phase 3 (Admin CRUD) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the admin console full control over exam blueprints (create/edit/reorder blueprints, sections, course notes; toggle mechanics flags; publish/draft) and tie the knowledgebase in via a `skill_category` on CSV import.

**Architecture:** One admin-gated API route (`app/api/exam-blueprints/route.ts`) for list/upsert/delete (full-replace of a blueprint's sections + notes per save), an admin list page + a client editor form (following the existing `app/admin/listings` / `app/admin/upcat/import` patterns), a sidebar nav entry, and a `skill_category` column mapping in `importUpcatCore`.

**Tech Stack:** Next.js (App Router, RSC + client components), Supabase JS (`createServerClient` service role for writes, `createAuthClient` for the admin gate), Vitest. **Admin deploys via Vercel on push — no OTA.**

**Reference spec:** `docs/superpowers/specs/2026-06-10-exam-blueprints-design.md`. **Auth gate pattern:** see `apps/admin/app/api/upcat-questions/import/route.ts` (createAuthClient → getUser → `profiles.role === 'admin'` → 401/403, then `createServerClient()` for DB). **Form/page patterns:** `apps/admin/app/admin/listings/*` and `apps/admin/components/admin/*`. **Sidebar:** `apps/admin/components/admin/SidebarContent.tsx` (`NAV` array).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/admin/lib/upcat/importUpcatCore.ts` | Map a `skill_category` CSV column (default from subtest) | Modify |
| `apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts` | skill_category mapping test | Modify (append) |
| `apps/admin/app/api/exam-blueprints/route.ts` | GET (list + categories), PUT (upsert blueprint+sections+notes), DELETE | Create |
| `apps/admin/app/api/exam-blueprints/__tests__/route.test.ts` | Route auth + upsert/delete tests | Create |
| `apps/admin/app/admin/exam-blueprints/page.tsx` | Server: list blueprints + "New" link | Create |
| `apps/admin/app/admin/exam-blueprints/[slug]/page.tsx` | Server: load one blueprint + categories, render editor | Create |
| `apps/admin/components/admin/BlueprintEditor.tsx` | Client form: blueprint fields + sections + notes + save | Create |
| `apps/admin/components/admin/SidebarContent.tsx` | Add "Exam Blueprints" nav item | Modify |

---

### Task 1: `skill_category` on CSV import (knowledgebase tie-in)

**Files:**
- Modify: `apps/admin/lib/upcat/importUpcatCore.ts`
- Test: `apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts` (append)

- [ ] **Step 1: Write the failing test** (append inside the describe)

```ts
it('maps skill_category from the row, defaulting from subtest when absent', async () => {
  const { client, inserted } = makeMockClient()
  await importUpcatCore(client as any, [
    row({ question_id: 'M1', subtest: 'Mathematics' }),                                   // default
    row({ question_id: 'A1', subtest: 'Science', question_text: 'Q?' , ...( { skill_category: 'Abstract/Non-Verbal Reasoning' } as any) }),
  ])
  expect(inserted.questions.find((q: any) => q.question_id === 'M1').skill_category).toBe('Mathematics')
  expect(inserted.questions.find((q: any) => q.question_id === 'A1').skill_category).toBe('Abstract/Non-Verbal Reasoning')
})
```

Also extend the `RawUpcatRow` cast in the `row()` helper is not needed — `skill_category` is optional; add `skill_category?: string` to the `RawUpcatRow` interface (Step 3).

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/admin && npx vitest run lib/upcat`
Expected: FAIL (skill_category undefined).

- [ ] **Step 3: Implement**

In `apps/admin/lib/upcat/importUpcatCore.ts`:
1. Add `skill_category?: string` to the `RawUpcatRow` interface.
2. Add a default map near `VALID_SUBTESTS`:
```ts
const SUBTEST_CATEGORY: Record<string, string> = {
  'Mathematics': 'Mathematics',
  'Science': 'Science',
  'Language Proficiency': 'English/Language',
  'Reading Comprehension': 'Reading Comprehension',
}
```
3. In the `questionRows = rows.map(...)` object, add:
```ts
      skill_category: cleanImportedText(r.skill_category) || SUBTEST_CATEGORY[cleanImportedText(r.subtest)] || null,
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/admin && npx vitest run lib/upcat`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/admin/lib/upcat/importUpcatCore.ts apps/admin/lib/upcat/__tests__/importUpcatCore.test.ts
git commit -m "feat(admin): map skill_category on UPCAT CSV import (default from subtest)"
```

---

### Task 2: Blueprint CRUD API route

**Files:**
- Create: `apps/admin/app/api/exam-blueprints/route.ts`
- Test: `apps/admin/app/api/exam-blueprints/__tests__/route.test.ts`

- [ ] **Step 1: Implement the route**

Create `apps/admin/app/api/exam-blueprints/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { createAuthClient } from '@/lib/supabase'

export const runtime = 'nodejs'

async function requireAdmin() {
  const auth = await createAuthClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = createServerClient()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase }
}

// GET: list blueprints (+ their sections, notes) and the skill-category options.
export async function GET() {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const [bp, sec, notes, cats] = await Promise.all([
    supabase.from('exam_blueprints').select('*').order('display_order'),
    supabase.from('exam_blueprint_sections').select('*').order('display_order'),
    supabase.from('exam_course_notes').select('*').order('display_order'),
    supabase.from('exam_skill_categories').select('*').order('display_order'),
  ])
  return NextResponse.json({
    blueprints: bp.data ?? [], sections: sec.data ?? [], courseNotes: notes.data ?? [], categories: cats.data ?? [],
  })
}

// PUT: upsert one blueprint and FULLY REPLACE its sections + course notes.
export async function PUT(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const body = await req.json()
  const bp = body.blueprint
  if (!bp?.slug) return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  const slug = String(bp.slug).trim()

  const { error: bpErr } = await supabase.from('exam_blueprints').upsert({
    slug, name: bp.name ?? '', acronym: bp.acronym ?? '',
    total_items: Number(bp.total_items) || 0, total_time_minutes: Number(bp.total_time_minutes) || 0,
    has_guessing_penalty: !!bp.has_guessing_penalty, guessing_penalty: Number(bp.guessing_penalty) || 0.25,
    section_blocked: !!bp.section_blocked, scoring_note: bp.scoring_note ?? '', mechanics_note: bp.mechanics_note ?? '',
    status: bp.status === 'published' ? 'published' : 'draft', display_order: Number(bp.display_order) || 0,
  }, { onConflict: 'slug' })
  if (bpErr) return NextResponse.json({ error: bpErr.message }, { status: 500 })

  // Full-replace sections + notes for this slug.
  await supabase.from('exam_blueprint_sections').delete().eq('blueprint_slug', slug)
  await supabase.from('exam_course_notes').delete().eq('blueprint_slug', slug)

  const sections = Array.isArray(body.sections) ? body.sections : []
  if (sections.length) {
    const rows = sections.map((s: any, i: number) => ({
      id: `${slug}:${i + 1}`, blueprint_slug: slug, name: s.name ?? '', skill_category: s.skill_category ?? '',
      item_count: Number(s.item_count) || 0, time_minutes: s.time_minutes != null && s.time_minutes !== '' ? Number(s.time_minutes) : null,
      requires_spatial_logic: !!s.requires_spatial_logic, display_order: i + 1,
    }))
    const { error } = await supabase.from('exam_blueprint_sections').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const notes = Array.isArray(body.courseNotes) ? body.courseNotes : []
  if (notes.length) {
    const rows = notes.map((n: any, i: number) => ({
      id: `${slug}:note:${i + 1}`, blueprint_slug: slug, course_cluster: n.course_cluster ?? 'all',
      note: n.note ?? '', min_percentile: n.min_percentile != null && n.min_percentile !== '' ? Number(n.min_percentile) : null, display_order: i + 1,
    }))
    const { error } = await supabase.from('exam_course_notes').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, slug })
}

// DELETE ?slug=...
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  const { supabase } = gate
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })
  const { error } = await supabase.from('exam_blueprints').delete().eq('slug', slug) // cascades sections + notes
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Write the test**

Create `apps/admin/app/api/exam-blueprints/__tests__/route.test.ts` modeled on `apps/admin/app/api/flashcards/cards/__tests__/route.test.ts` (same `vi.mock('@iskotify/utils')` + `@/lib/supabase` mock approach). Cover: (a) GET returns 403 when `profiles.role !== 'admin'`; (b) PUT with a valid admin upserts the blueprint and inserts sections (assert the supabase `from('exam_blueprints').upsert` and `from('exam_blueprint_sections').insert` were called); (c) PUT returns 400 when `blueprint.slug` is missing. Mock `createAuthClient` to return a user, and `createServerClient` to return a chainable mock whose `from('profiles').select().eq().single()` resolves `{ data: { role: 'admin' } }` (or non-admin for the 403 test), and whose `upsert`/`insert`/`delete`/`eq` resolve `{ error: null }`.

- [ ] **Step 3: Run the test**

Run: `cd apps/admin && npx vitest run app/api/exam-blueprints`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/app/api/exam-blueprints/route.ts apps/admin/app/api/exam-blueprints/__tests__/route.test.ts
git commit -m "feat(admin): exam-blueprints CRUD API (list/upsert/delete, admin-gated)"
```

---

### Task 3: Admin list page + editor

**Files:**
- Create: `apps/admin/app/admin/exam-blueprints/page.tsx` (server component)
- Create: `apps/admin/app/admin/exam-blueprints/[slug]/page.tsx` (server component)
- Create: `apps/admin/components/admin/BlueprintEditor.tsx` (client component)

Follow the existing admin page/styling conventions (Tailwind classes used in `app/admin/listings` + `components/admin/*`; the admin gate is handled by `app/admin/layout.tsx`).

- [ ] **Step 1: List page** — `app/admin/exam-blueprints/page.tsx`

Server component: `createServerClient()`, fetch `exam_blueprints` ordered by `display_order`. Render a heading "Exam Blueprints", a table/list of blueprints (name, acronym, total_items, total_time_minutes, status badge) with a link to `/admin/exam-blueprints/<slug>` per row, and a "+ New blueprint" link to `/admin/exam-blueprints/new`. Use `export const dynamic = 'force-dynamic'` (live admin data).

- [ ] **Step 2: Editor page** — `app/admin/exam-blueprints/[slug]/page.tsx`

Server component: read `params.slug`. `createServerClient()`. If `slug !== 'new'`, fetch the blueprint + its sections + course notes; also fetch all `exam_skill_categories` (for the dropdown). Pass them to `<BlueprintEditor initialBlueprint=… initialSections=… initialNotes=… categories=… isNew={slug === 'new'} />`.

- [ ] **Step 3: Editor form** — `components/admin/BlueprintEditor.tsx` (`'use client'`)

A controlled form with:
- Blueprint fields: `slug` (editable only when isNew), `name`, `acronym`, `total_items` (number), `total_time_minutes` (number), `has_guessing_penalty` (checkbox), `guessing_penalty` (number, shown when penalty on), `section_blocked` (checkbox), `scoring_note` (textarea), `mechanics_note` (textarea), `status` (select draft/published), `display_order` (number).
- **Sections** editor: a list of rows, each `{ name, skill_category (select from `categories`), item_count (number), time_minutes (number, optional — labelled "per-section minutes (only used if section-blocked)"), requires_spatial_logic (checkbox) }`, with "Add section" / "Remove" buttons. Order = list order.
- **Course notes** editor: a list of rows `{ course_cluster, note (textarea), min_percentile (number, optional) }` with add/remove.
- A **Save** button → `fetch('/api/exam-blueprints', { method: 'PUT', body: JSON.stringify({ blueprint, sections, courseNotes }) })`; on success `router.push('/admin/exam-blueprints')` + `router.refresh()`. Show inline error on non-200.
- A **Delete** button (when not isNew) → `fetch('/api/exam-blueprints?slug='+slug, { method: 'DELETE' })` with a confirm, then back to the list.

Match the Tailwind styling of existing admin forms (inputs `border rounded px-3 py-2`, buttons like the existing admin buttons). Keep it a single focused file.

- [ ] **Step 4: Type-check / build-check**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | grep -E "exam-blueprints|BlueprintEditor"` → expect empty (no type errors in the new files).

- [ ] **Step 5: Commit**

```bash
git add "apps/admin/app/admin/exam-blueprints/page.tsx" "apps/admin/app/admin/exam-blueprints/[slug]/page.tsx" apps/admin/components/admin/BlueprintEditor.tsx
git commit -m "feat(admin): exam blueprints list + editor UI"
```

---

### Task 4: Sidebar nav entry

**Files:**
- Modify: `apps/admin/components/admin/SidebarContent.tsx`

- [ ] **Step 1: Add the nav item**

In the `NAV` array, add to the Knowledgebase section's `items` (after the existing entries):
```ts
      { href: '/admin/exam-blueprints', icon: '🧭', label: 'Exam Blueprints' },
```

- [ ] **Step 2: Type-check + commit**

Run: `cd apps/admin && npx tsc --noEmit 2>&1 | grep SidebarContent` → empty.
```bash
git add apps/admin/components/admin/SidebarContent.tsx
git commit -m "feat(admin): Exam Blueprints sidebar nav entry"
```

---

### Task 5: Full verification + push

- [ ] **Step 1:** `cd apps/admin && npx vitest run 2>&1 | tail -6` → all admin tests pass.
- [ ] **Step 2:** `cd apps/admin && npx tsc --noEmit 2>&1 | grep -E "\\.tsx?\\(" | head` → no errors in admin source (ignore any pre-existing).
- [ ] **Step 3:** `git push origin master` (admin deploys via Vercel; no OTA).

---

## Self-Review

**Spec coverage (Phase 3 portion):**
- Admin CRUD for blueprints + sections + course notes → Tasks 2 (API) + 3 (UI). ✓
- Toggle mechanics flags, items/times, publish/draft, reorder → Task 3 editor. ✓
- Category taxonomy: used as a dropdown sourced from `exam_skill_categories` (Task 3); full category CRUD deferred (categories are seeded + stable — YAGNI for now). The GET returns categories for the dropdown. ✓
- Skill-category picker on CSV import (knowledgebase tie-in) → Task 1. ✓
- Sidebar nav → Task 4. ✓
- Admin-gated writes (RLS + route auth) → Task 2 `requireAdmin`. ✓

**Deferred:** manual single-question add UI for `upcat_questions` doesn't exist (CSV-only); the skill-category picker there is N/A. Full category-taxonomy CRUD deferred. Per-course-note filtering on mobile is Phase 4.

**Type consistency:** the API PUT body shape `{ blueprint, sections, courseNotes }` matches what `BlueprintEditor` sends (Task 3 Step 3). Section field names (`name`, `skill_category`, `item_count`, `time_minutes`, `requires_spatial_logic`) and note fields (`course_cluster`, `note`, `min_percentile`) match the DB columns and the route's insert mapping. `requireAdmin` returns `{ error }` | `{ supabase }` consistently.

**Placeholder scan:** Tasks 1, 2, 4 are complete code. Task 3 is specified as a form with the exact fields + the exact API contract from Task 2 + named reference patterns (existing admin pages) — the reviewer verifies the fields + the PUT call shape.
