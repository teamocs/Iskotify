# Epic F — Admissions News & Updates Feed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. QA: `npx react-doctor --project @iskotify/mobile --diff <base>`; avoid `{n && <JSX/>}` bare-zero.

**Goal:** Fill the Updates tab (feed + events + changelog), add a UPCAT 2027 Home countdown, refresh matching exam dates, and a results tracker — from a flat `admissions_updates` table.

**Architecture:** 1 public-read Supabase table (admissions_updates) + a local-only SQLite `result_watches` + mirror listings.results_date. Feed UI in the existing Updates tab shell. Pushes excluded (native).

**Tech Stack:** Supabase (public-read RLS); Expo RN + Drizzle/expo-sqlite + Jest.

**Spec:** [docs/superpowers/specs/2026-06-07-epic-f-admissions-news-design.md](../specs/2026-06-07-epic-f-admissions-news-design.md)

**Source:** `…/Iskotify Upgrades/_extracted/admissions_update_20260603.txt`. Next migration = 023.

---

## Task 1: Migration 023 — admissions_updates

**Files:** Create `supabase/migrations/023_admissions_updates.sql`

- [ ] **Step 1:**
```sql
CREATE TABLE IF NOT EXISTS admissions_updates (
  id text PRIMARY KEY, report_date date NOT NULL, severity text NOT NULL,
  school_slug text, school_name text, title text NOT NULL, body text NOT NULL,
  action_required text, event_date date, event_type text,
  sources jsonb NOT NULL DEFAULT '[]', verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_admissions_event ON admissions_updates(event_date);
CREATE INDEX IF NOT EXISTS idx_admissions_report ON admissions_updates(report_date);
ALTER TABLE admissions_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admissions_updates_read ON admissions_updates;
CREATE POLICY admissions_updates_read ON admissions_updates FOR SELECT USING (true);
DROP TRIGGER IF EXISTS admissions_updates_updated_at ON admissions_updates;
CREATE TRIGGER admissions_updates_updated_at BEFORE UPDATE ON admissions_updates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```
- [ ] **Step 2:** Commit `feat(db): admissions_updates table (023)` (controller applies at Task 8).

## Task 2: Mobile schema — admissions mirror + result_watches + listings.results_date + sync

**Files:** Modify `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`, `apps/mobile/services/sync.ts` (+ sync test)

- [ ] **Step 1:** schema.ts:
```ts
export const admissionsUpdates = sqliteTable('admissions_updates', {
  id: text('id').primaryKey(), reportDate: text('report_date'), severity: text('severity').notNull(),
  schoolSlug: text('school_slug'), schoolName: text('school_name'), title: text('title').notNull(),
  body: text('body').notNull(), actionRequired: text('action_required'),
  eventDate: text('event_date'), eventType: text('event_type'),
  sources: text('sources').notNull().default('[]'), verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
  remoteUpdatedAt: integer('remote_updated_at'),
})
export const resultWatches = sqliteTable('result_watches', {
  slug: text('slug').primaryKey(), addedAt: integer('added_at').notNull(),
})
```
Also add `resultsDate: integer('results_date')` to the existing `listings` Drizzle table (mirror the Supabase column that wasn't yet synced).
- [ ] **Step 2:** client.ts MIGRATIONS: CREATE TABLE for admissions_updates + result_watches; `ALTER TABLE listings ADD COLUMN results_date INTEGER`.
- [ ] **Step 3:** sync.ts: add `admissions_updates` fetch (`.select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at').gt('updated_at', since)`) + upsert (sources→JSON.stringify(row.sources ?? []), verified→!!, dates→row.x ?? null as ISO string, remoteUpdatedAt→epoch). ALSO add `results_date` to the existing listings `.select(...)` + upsert (`resultsDate: row.results_date ? new Date(row.results_date).getTime() : null`). result_watches is NOT synced (local only).
- [ ] **Step 4:** Extend the real-SQLite sync test: a mock admissions_updates row lands (sources JSON round-trip); a listings row's results_date lands. Fixtures + mock for the new from() call.
- [ ] **Step 5:** tsc + sync test green. Commit `feat(mobile/updates): admissions_updates mirror + result_watches + listings.results_date + sync`.

## Task 3: Seed — admissions_updates + listings refresh

**Files:** Create `supabase/seed/admissions_updates_seed.sql`, `supabase/seed/listings_admissions_refresh.sql`

- [ ] **Step 1:** Read `C:\Users\User\Downloads\Iskotify Upgrades\_extracted\admissions_update_20260603.txt` fully. Hand-author `admissions_updates_seed.sql`: one row per digest item (the ~11 numbered items + the "no change confirmed" table rows as severity 'no_change' + the "unable to verify" rows as verified=false). For each: stable `id` (e.g. `2026-06-03-<slug>-<type>`), report_date '2026-06-03', severity ('urgent'|'important'|'info'|'no_change'), school_slug (best-effort match to a listings slug, else NULL), school_name, title (concise), body (the item's detail), action_required (the "Action:" line if any, else NULL), event_date (the carried date — UPCAT '2026-08-01'; app windows; etc.; NULL if none), event_type ('exam'|'deadline'|'results'|'app_open'|'app_close'|NULL), sources (`'[{"label":"...","url":"..."}]'::jsonb` from the item's source URLs, else '[]'), verified (true for confirmed, false for "unable to verify"). Idempotent `ON CONFLICT (id) DO UPDATE`. NO NULL into NOT NULL (report_date, severity, title, body — ensure non-empty). Escape single quotes.
- [ ] **Step 2:** `listings_admissions_refresh.sql`: idempotent `UPDATE listings SET exam_date='2026-08-01'... WHERE slug='...'` (and deadline where applicable) ONLY for items that map to an existing exam listing. Wrap each in a guard or just UPDATE (no-op if slug absent). The controller will confirm slugs at apply time. Include a leading comment listing which slugs you assumed.
- [ ] **Step 3:** Commit `feat(db/seed): admissions_updates from Jun-3 digest + listings exam-date refresh`.

## Task 4: Pure helpers (TDD)

**Files:** Create `apps/mobile/utils/admissionsFeed.ts` + test

- [ ] **Step 1: Tests** `apps/mobile/utils/__tests__/admissionsFeed.test.ts`:
```ts
import { daysUntil, sortBySeverityThenDate, upcomingEvents, SEVERITY_ORDER, type FeedItem } from '../admissionsFeed'
const item = (p: Partial<FeedItem>): FeedItem => ({ id:'x', reportDate:'2026-06-03', severity:'info', title:'t', body:'b', eventDate:null, eventType:null, ...p } as any)

describe('daysUntil', () => {
  it('positive for future, ~0 for today, negative for past', () => {
    const today = '2026-06-03'
    expect(daysUntil('2026-06-10', today)).toBe(7)
    expect(daysUntil('2026-06-03', today)).toBe(0)
    expect(daysUntil('2026-06-01', today)).toBe(-2)
  })
})
describe('sortBySeverityThenDate', () => {
  it('urgent first, then by reportDate desc', () => {
    const a = item({ id:'a', severity:'info', reportDate:'2026-06-03' })
    const b = item({ id:'b', severity:'urgent', reportDate:'2026-05-01' })
    expect(sortBySeverityThenDate([a,b]).map(x=>x.id)).toEqual(['b','a'])
  })
})
describe('upcomingEvents', () => {
  it('keeps only future event_date, sorted asc', () => {
    const past = item({ id:'p', eventDate:'2026-06-01' })
    const fut1 = item({ id:'f1', eventDate:'2026-08-01' })
    const fut2 = item({ id:'f2', eventDate:'2026-07-01' })
    expect(upcomingEvents([past,fut1,fut2], '2026-06-03').map(x=>x.id)).toEqual(['f2','f1'])
  })
  it('excludes items without event_date', () => {
    expect(upcomingEvents([item({ id:'n', eventDate:null })], '2026-06-03')).toEqual([])
  })
})
```
- [ ] **Step 2:** Run → FAIL. Implement `apps/mobile/utils/admissionsFeed.ts`: `SEVERITY_ORDER = { urgent:0, important:1, info:2, no_change:3 }`; `daysUntil(dateISO, todayISO?)` (date-only diff in days; default today = new Date() — but accept an injected today for tests); `sortBySeverityThenDate(items)`; `upcomingEvents(items, todayISO?)` (filter eventDate >= today, sort asc). Export `FeedItem` type.
- [ ] **Step 3:** Run → PASS. Commit `feat(mobile/updates): admissionsFeed pure helpers (daysUntil, sort, upcoming)`.

## Task 5: Updates tab feed

**Files:** Modify `apps/mobile/app/(tabs)/updates.tsx`; (optional `components/updates/NewsDetailModal.tsx`)

- [ ] **Step 1:** Read the current shell (header + ScrollView + 3 PlaceholderCards). Load `admissionsUpdates` via `useDb`. Replace placeholders:
  - **Upcoming Events**: `upcomingEvents(rows)` → cards (school_name, event_type chip, date + `daysUntil` "in N days"). Cap 8.
  - **News**: `sortBySeverityThenDate(rows)` → rows (severity badge 🔴 urgent/🟠 important/🟡 info/✅ no_change, school_name, title, 1-line body). Tap → a detail modal (full body, action_required, source links via Linking). Cap 12.
  - **Iskotify Updates**: a static `const CHANGELOG = [{version,date,notes[]}]` array (include this MVP push's highlights: UPCAT mock exam, scholarships, exam-flow rework, score estimator, career advisor, school finder, admissions feed) rendered as a list.
  - A "📋 Results Tracker" card → `/results-tracker`.
- [ ] **Step 2:** tsc + react-doctor + a render test (mock local rows → Upcoming Events + News sections render; severity order). Commit `feat(mobile/updates): Updates tab feed (events, news+detail, changelog)`.

## Task 6: Results tracker + watch toggle

**Files:** Create `apps/mobile/app/results-tracker.tsx`; Modify `apps/mobile/app/listings/[slug].tsx`

- [ ] **Step 1: results-tracker.tsx** — load `resultWatches` joined to `listings` by slug. For each: exam title, results_date (the mirrored `resultsDate`), status via daysUntil(resultsDate): future → "Waiting · results ~{date}"; past/today → "Results may be out — check official site" + the listing external link. Remove-watch button. Empty state ("Watch an exam's results from its page"). 
- [ ] **Step 2: watch toggle** — in `listings/[slug].tsx`, for `type==='exam'` listings add a "🔔 Watch results" toggle that inserts/deletes a `result_watches` row (by slug) via useDb; reflect current state on load.
- [ ] **Step 3:** tsc + react-doctor + test (toggle adds/removes; tracker shows waiting/released). Commit `feat(mobile/updates): results tracker + watch-results toggle on exam listings`.

## Task 7: Home UPCAT countdown + events fold-in

**Files:** Modify `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1:** Load `admissionsUpdates`. **UPCAT countdown banner** near top: find a row with school_slug containing 'upcat' (or event_type='exam' + title ~UPCAT) + severity 'urgent' + future event_date; render "🎓 UPCAT 2027 in {daysUntil} days" linking to the UPCAT practice or the update; hide when none/past. **Fold events**: extend the existing "Upcoming Dates" widget (Epic G) + CalendarStrip important-day markers to ALSO include high-severity admissions `event_date`s (merge into the existing upcomingDates source + importantDayIndices). Keep existing focused-listing dates.
- [ ] **Step 2:** tsc + react-doctor + home test (countdown gated; renders when a future urgent UPCAT event exists). Commit `feat(mobile/home): UPCAT 2027 countdown + admissions events in upcoming dates`.

## Task 8: Verify + apply

- [ ] **Step 1:** `cd apps/mobile && pnpm test | tail -6`; `cd apps/admin && pnpm test | tail -4`; `npx react-doctor --project @iskotify/mobile --diff <epic-base> --no-warnings --no-telemetry`.
- [ ] **Step 2 (controller, MCP):** apply migration 023; apply `admissions_updates_seed.sql`; confirm exam-listing slugs (`SELECT slug FROM listings WHERE type='exam'`) then apply the applicable `listings_admissions_refresh.sql` UPDATEs; verify `SELECT severity, count(*) FROM admissions_updates GROUP BY severity`; `get_advisors security`.
- [ ] **Step 3:** Manual smoke (after OTA): Updates tab → events + news (urgent first) + detail modal + changelog; Home → UPCAT countdown; exam listing → Watch results → Results Tracker shows it.

---

## Self-review against the spec
- F1 schema → Tasks 1–2 ✓ (admissions_updates + result_watches + listings.results_date)
- F2 seed → Task 3 ✓
- F3 sync → Task 2 ✓
- F4 Updates tab → Task 5 ✓ (events, news+detail, changelog, tracker entry)
- F5 Home → Task 7 ✓ (countdown + events fold-in)
- F6 results tracker → Task 6 ✓
- Delivery via MCP + OTA → Task 8 ✓
- Type/name consistency: `admissions_updates`/`admissionsUpdates`/`result_watches`/`resultWatches`/`resultsDate`/`daysUntil`/`sortBySeverityThenDate`/`upcomingEvents` ✓
