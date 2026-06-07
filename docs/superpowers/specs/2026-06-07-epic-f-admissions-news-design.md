# Epic F — Admissions News & Updates Feed — Design Spec

**Date:** 2026-06-07
**Status:** Draft for review
**Master plan:** [2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic F §2)
**Source:** `…/Iskotify Upgrades/_extracted/admissions_update_20260603.txt` (weekly prose digest, ~11 items).
**Scope (locked):** FULL per the brief — admissions_updates table + seed + Updates-tab feed + UPCAT 2027 countdown on Home + exam-date refresh on matching listings + a **results tracker**. Push notifications EXCLUDED (need a native module/build; not OTA-deliverable).
**Depends on:** Updates tab shell (Epic G — done), testing-center data (Epic C — done).

---

## 1. Goal

Fill the Updates tab with a real admissions feed (Upcoming Events + News + Iskotify Updates), add a UPCAT 2027 countdown on Home, refresh exam dates on matching listings, and let students track which exam results they're waiting for — all from a flat `admissions_updates` table seeded from the weekly digest (Gemini-extract → review → publish workflow; MVP seed hand-authored).

## 2. Architecture (6 areas)

- **F1 Schema** (migration 023): `admissions_updates` (flat, public-read). Mobile mirror + a LOCAL-only SQLite `result_watches` (user-state; no Supabase).
- **F2 Seed**: hand-author `admissions_updates` rows from the June-3 digest (urgent/important/info/no_change) + an idempotent `listings` exam_date/deadline refresh for matching slugs (UPCAT, FEU, PUP, PLM, …) where a listing exists.
- **F3 Sync**: pull `admissions_updates` (incremental `gt('updated_at', since)`).
- **F4 Updates tab**: replace the 3 placeholder cards with Upcoming Events (future `event_date`), News (by severity then report_date), Iskotify Updates (static code-side changelog); news item → detail modal with sources.
- **F5 Home**: UPCAT 2027 countdown banner (from the urgent admissions_updates event) + fold admissions event dates into the existing upcoming-dates widget / calendar strip.
- **F6 Results tracker**: a "Results Tracker" view (in Updates) where the user watches exams (local `result_watches`); shows waiting/released status vs each exam's `results_date`; a "Watch results" toggle on exam-type listing detail.

## 3. Data model (F1)

**Supabase (migration 023) — public-read RLS + updated_at trigger:**
```sql
CREATE TABLE admissions_updates (
  id text PRIMARY KEY, report_date date NOT NULL, severity text NOT NULL,  -- urgent|important|info|no_change
  school_slug text, school_name text, title text NOT NULL, body text NOT NULL,
  action_required text, event_date date, event_type text,  -- exam|deadline|results|app_open|app_close
  sources jsonb NOT NULL DEFAULT '[]', verified boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX idx_admissions_event ON admissions_updates(event_date);
CREATE INDEX idx_admissions_report ON admissions_updates(report_date);
```

**Mobile SQLite:**
- `admissionsUpdates` mirror (sources jsonb→TEXT JSON, verified int bool, dates as TEXT ISO or epoch — store as TEXT ISO `report_date`/`event_date` for simple display + comparison; remoteUpdatedAt int).
- `result_watches` (LOCAL only): `{ slug text pk, added_at int }`. No Supabase table (per-device, like other local prefs).

## 4. Seed (F2)
Hand-author `supabase/seed/admissions_updates_seed.sql` from the digest: ~11 primary items + the no-change rows (severity 'no_change'). Each: stable `id` (e.g. `2026-06-03-upcat-2027-exam`), report_date '2026-06-03', severity, school_slug (match a listings slug when one exists, else null), school_name, title, body, action_required, event_date (the carried date, e.g. UPCAT '2026-08-01'), event_type, sources jsonb (`[{"label","url"}]`), verified (true for confirmed items, false for "unable to verify"). Idempotent `ON CONFLICT (id) DO UPDATE`.
Plus `supabase/seed/listings_admissions_refresh.sql`: idempotent `UPDATE listings SET exam_date=…/deadline=… WHERE slug='…'` for the items that match an existing exam listing (controller confirms slugs via `SELECT slug FROM listings WHERE type='exam'` at apply time; skip non-existent).

## 5. Updates tab (F4) — `apps/mobile/app/(tabs)/updates.tsx`
Keep the SafeAreaView/header/ScrollView scaffold; replace the 3 placeholders:
1. **Upcoming Events** — `admissionsUpdates` with `event_date >= today`, sorted asc; cards show school_name, event_type chip, date + days-until counter (reuse Home's daysUntil pattern). Cap ~8.
2. **News** — all `admissionsUpdates` sorted by severity (urgent→important→info→no_change) then report_date desc; each row: severity badge (🔴/🟠/🟡/✅), school_name, title, 1-line body; tap → a detail modal (full body, action_required, source links). Cap ~12.
3. **Iskotify Updates** — a static code-side changelog array (`{version, date, notes[]}`) rendered as a list (this epic's + prior releases' highlights). No DB.
4. A "📋 Results Tracker" entry (card/button) → the results-tracker view (F6).

## 6. Home (F5) — `apps/mobile/app/(tabs)/index.tsx`
- **UPCAT 2027 countdown banner** near the top: gated on an `admissionsUpdates` row with school_slug='upcat'/severity urgent + a future event_date; shows "UPCAT 2027 in N days" (runtime daysUntil). Hide when none/past.
- Fold admissions `event_date`s (high-severity) into the existing "Upcoming Dates" widget + `CalendarStrip` important-day markers (Epic G added the widget — extend its source to also include admissions events).

## 7. Results tracker (F6)
- `apps/mobile/app/results-tracker.tsx` (or a section in Updates): lists the user's watched exams (`result_watches` joined to `listings` by slug) with each exam's `results_date` and a status: "Waiting · results ~{results_date}" (future) / "Results may be out — check official site" (past results_date) + the listing's external link. Add/remove watches.
- A "🔔 Watch results" toggle on exam-type `listings/[slug]` detail that adds/removes a `result_watches` row.
- (`listings.results_date` exists in Supabase but isn't mirrored to SQLite yet — F1/F3 must add `resultsDate` to the mobile listings schema + sync select so the tracker has it. Small additive change.)

## 8. Sync (F3)
`sync.ts`: pull `admissions_updates` (`.select('id,report_date,severity,school_slug,school_name,title,body,action_required,event_date,event_type,sources,verified,updated_at').gt('updated_at', since)`); upsert (sources→JSON.stringify, verified→!!, dates→ISO string). Also add `results_date` to the existing `listings` select + upsert (mirror the missing column). FTS not needed.

## 9. Testing
- Seed: SQL validity (controller applies via MCP).
- Sync: admissions_updates + listings.results_date land in SQLite (extend real-SQLite sync test).
- Pure helper: `daysUntil(dateISO)` / event sorting / severity ordering (TDD).
- UI: Updates tab renders Upcoming Events + News (severity order) + Iskotify Updates from mocked local data; news detail modal; results-tracker add/remove + waiting/released status; Home countdown gated correctly.
- react-doctor `--project @iskotify/mobile`; full mobile + admin suites green.

## 10. Delivery
Migration 023 + seeds applied via Supabase MCP at verify (next migration = 023). Mobile ships in the final-batch OTA.

## 11. Sequencing (plan → bite-sized TDD)
1. Migration 023 (admissions_updates).
2. Mobile schema: admissionsUpdates mirror + result_watches (local) + add listings.resultsDate; sync pull (+ results_date).
3. Seed: admissions_updates from the digest + listings exam-date/deadline refresh.
4. Pure helpers (daysUntil, event/severity sort) — TDD.
5. Updates tab feed (Upcoming Events + News + detail modal + Iskotify Updates static).
6. Results tracker view + "Watch results" toggle on exam listing detail.
7. Home UPCAT countdown + fold events into upcoming-dates/calendar.
8. Verify (suites, react-doctor) + apply 023 + seeds via MCP.

## 12. Open questions (proposed defaults)
- Dates stored in SQLite as ISO strings (simple display + lexicographic compare for date-only). (Proposed.)
- result_watches is LOCAL-only (per-device), not synced. (Proposed.)
- Iskotify Updates changelog is a small static array in code (not DB). (Proposed.)
- Weekly digest ingestion stays hand-authored/Gemini-review for now; no auto-parser this epic. (Proposed.)
