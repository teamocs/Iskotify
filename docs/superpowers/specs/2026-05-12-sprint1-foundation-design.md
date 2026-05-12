# Sprint 1: Foundation & Database — Design Spec

**Date:** 2026-05-12
**Status:** Approved
**Scope:** Supabase schema setup (all tables) + Google Sheets → Supabase sync pipeline

---

## 1. Overview

Sprint 1 lays the entire data foundation for Iskotify. It does two things:

1. **Creates all 8 Supabase tables** in a single migration — listings, users, flashcards, and progress tracking. Tables needed by later sprints exist from day one so there are no breaking schema migrations mid-project.
2. **Wires Google Sheets → Supabase sync** via a Google Apps Script webhook + Next.js API route, so the admin can manage listings in a spreadsheet and have changes go live within ~2 seconds.

No UI is built in this sprint. The output is a fully seeded, publicly queryable `listings` table and a working sync pipeline.

---

## 2. Database Schema

### 2.1 Approach

All tables are created in a single migration file (`supabase/migrations/001_initial_schema.sql`). Sprint 1 populates `listings`, `profiles`, and `user_saved_listings`. The remaining five tables are created now but stay empty until their respective sprints.

Conflict key for upserts: `listings.slug` — stable across title renames.
Soft deletes only: removing a row from the sheet sets `status = 'closed'`, never hard-deletes (preserves foreign key integrity with `user_saved_listings`).

### 2.2 Tables

#### `listings` — Sprint 1 active

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| type | text | `'scholarship'` or `'exam'` |
| title | text | NOT NULL |
| slug | text | UNIQUE, NOT NULL — URL key and upsert conflict key |
| provider | text | Offering organization |
| description | text | |
| requirements | text[] | Eligibility list |
| coverage | text | What the scholarship covers |
| deadline | date | Application deadline |
| exam_date | date | Qualifying exam date |
| results_date | date | Results release date |
| events | jsonb | `[{"name": "Orientation", "date": "2026-03-10"}, ...]` |
| target_courses | text[] | Eligible degree programs |
| target_year_levels | text[] | e.g. `["Grade 12", "1st Year College"]` |
| tags | text[] | Freeform filter labels |
| status | text | `'active'` / `'closed'` / `'upcoming'` |
| region | text | `'NCR'`, `'Luzon'`, `'Nationwide'`, etc. |
| grant_amount | numeric | Monthly/annual PHP value |
| external_url | text | Official application link |
| image_url | text | Cover image for listing cards |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), updated via trigger |

RLS: public SELECT, no public INSERT/UPDATE/DELETE. Service role key used for sync writes.

#### `profiles` — Sprint 1 active

Extends `auth.users`. Created automatically on user signup via a Supabase trigger.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, references auth.users(id) ON DELETE CASCADE |
| full_name | text | |
| avatar_url | text | |
| year_level | text | e.g. `'Grade 12'`, `'2nd Year College'` |
| target_courses | text[] | Set during onboarding (Sprint 4) |
| region | text | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

RLS: owner-only SELECT/UPDATE.

#### `user_saved_listings` — Sprint 1 active (used in Sprint 3+)

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → profiles(id) ON DELETE CASCADE |
| listing_id | uuid | FK → listings(id) ON DELETE CASCADE |
| saved_at | timestamptz | default now() |

Constraint: `UNIQUE(user_id, listing_id)`.
RLS: owner-only SELECT/INSERT/DELETE.

#### `flashcard_subjects` — created Sprint 1, used Sprint 2

| Column | Type |
|---|---|
| id | uuid PK |
| name | text UNIQUE NOT NULL |
| icon_url | text |
| created_at | timestamptz |

#### `flashcard_topics` — created Sprint 1, used Sprint 2

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| subject_id | uuid | FK → flashcard_subjects(id) |
| name | text NOT NULL | |
| created_at | timestamptz | |

#### `flashcards` — created Sprint 1, used Sprint 2

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| topic_id | uuid | FK → flashcard_topics(id) |
| question | text NOT NULL | |
| answer | text NOT NULL | |
| explanation | text | Optional elaboration |
| difficulty | int | 1 = easy, 2 = medium, 3 = hard |
| source_pdf_url | text | Origin PDF (for traceability) |
| created_at | timestamptz | |

#### `practice_sessions` — created Sprint 1, used Sprint 4

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | FK → profiles(id) |
| topic_id | uuid | FK → flashcard_topics(id) |
| title | text | Custom session name e.g. "Algebra Mastery" |
| started_at | timestamptz | |
| ended_at | timestamptz | Null if in progress |
| total_cards | int | |
| correct_count | int | |

RLS: owner-only.

#### `user_flashcard_progress` — created Sprint 1, used Sprint 4

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | FK → profiles(id) |
| flashcard_id | uuid | FK → flashcards(id) |
| times_seen | int | default 0 |
| times_correct | int | default 0 |
| readiness_score | float | `times_correct / times_seen` — read by Kalaw AI |
| last_seen_at | timestamptz | |

Constraint: `UNIQUE(user_id, flashcard_id)`.
RLS: owner-only.

### 2.3 Indexes

```sql
-- Fast listing feed queries
CREATE INDEX ON listings(status);
CREATE INDEX ON listings(type);
CREATE INDEX ON listings(deadline);
CREATE INDEX ON listings(region);
CREATE INDEX ON listings USING GIN(tags);
CREATE INDEX ON listings USING GIN(target_courses);

-- Fast user data lookups
CREATE INDEX ON user_saved_listings(user_id);
CREATE INDEX ON user_flashcard_progress(user_id);
CREATE INDEX ON practice_sessions(user_id);
```

---

## 3. Google Sheets Sync Pipeline

### 3.1 Trigger Flow

```
Admin edits Google Sheet
  → Apps Script onEdit fires
    → POST /api/sheets/sync  (with SYNC_SECRET header)
      → Next.js verifies secret
        → Reads full sheet via Google Sheets API (service account)
          → Zod validates + transforms each row
            → Supabase upsert on slug conflict
              → Changes live in ~2 seconds
```

### 3.2 Files

| File | Purpose |
|---|---|
| `supabase/migrations/001_initial_schema.sql` | All 8 tables, RLS policies, indexes, triggers |
| `apps/admin/app/api/sheets/sync/route.ts` | Next.js POST handler — auth, fetch, upsert |
| `apps/admin/scripts/sheets-trigger.gs` | Google Apps Script — onEdit → webhook POST |
| `packages/utils/src/sheets.ts` | Row transformer + Zod schema for listing rows |
| `packages/utils/src/supabase.ts` | Typed Supabase client (server + browser variants) |

### 3.3 Sync Route Behaviour

- **Auth:** Request must include `Authorization: Bearer <SYNC_SECRET>`. Returns 401 otherwise.
- **Read:** Fetches all rows from the sheet using a Google service account (no OAuth flow needed).
- **Transform:** Each row is validated with Zod. Invalid rows are logged via `console.error` (visible in Vercel function logs) and skipped — they do not abort the sync.
- **Upsert:** `INSERT INTO listings ... ON CONFLICT (slug) DO UPDATE SET ...` — one DB round-trip for the whole sheet.
- **Soft delete:** Rows whose `slug` is no longer in the sheet are set to `status = 'closed'`, not deleted.
- **Response:** Returns `{ synced: N, skipped: M, closed: K }` for observability.

### 3.4 Google Sheet Column Layout

Row 1 is the header row (column names). Data starts at row 2. The Apps Script skips row 1 when iterating. Columns map directly to the `listings` table fields in order. Multi-value fields (arrays) use pipe `|` as separator in the cell. The `events` column uses alternating `Name|Date` pairs: `Orientation|2026-03-10|Interview|2026-04-05`.

### 3.5 Environment Variables

```bash
# apps/admin/.env.local
SYNC_SECRET=<long-random-string>               # shared with Apps Script
GOOGLE_SHEETS_ID=<sheet-id>
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...               # server-only, never exposed to client
```

---

## 4. Row-Level Security Summary

| Table | Public read | Owner read/write | Service role |
|---|---|---|---|
| listings | ✅ | — | ✅ (sync writes) |
| profiles | — | ✅ | ✅ |
| user_saved_listings | — | ✅ | ✅ |
| flashcard_subjects | ✅ | — | ✅ |
| flashcard_topics | ✅ | — | ✅ |
| flashcards | ✅ | — | ✅ |
| practice_sessions | — | ✅ | ✅ |
| user_flashcard_progress | — | ✅ | ✅ |

---

## 5. What Sprint 1 Does NOT Include

- No UI (landing page is Sprint 2, mobile is Sprint 3)
- No user auth flows (schema exists, wired in Sprint 3)
- No flashcard generation (Sprint 2)
- No Kalaw AI (Sprint 6)

---

## 6. Definition of Done

- [ ] `supabase/migrations/001_initial_schema.sql` runs cleanly on a fresh Supabase project
- [ ] All 8 tables exist with correct columns, constraints, and RLS policies
- [ ] `packages/utils/src/sheets.ts` exports a typed `transformSheetRow()` function with Zod validation
- [ ] `POST /api/sheets/sync` returns 401 for missing/wrong secret
- [ ] `POST /api/sheets/sync` upserts a test row and returns `{ synced: 1, skipped: 0, closed: 0 }`
- [ ] `apps/admin/scripts/sheets-trigger.gs` is documented with one-time setup instructions
- [ ] `.env.example` lists all required variables with placeholder values
