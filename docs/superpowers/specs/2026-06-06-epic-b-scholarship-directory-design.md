# Epic B — Scholarship Directory Expansion + Eligibility Matcher — Design Spec

**Date:** 2026-06-06
**Status:** Draft for review
**Master plan:** [docs/superpowers/specs/2026-06-06-mvp-upgrades-master-plan.md](2026-06-06-mvp-upgrades-master-plan.md) (Epic B)
**Locked product decisions (see memory `mvp-upgrades-decisions`):**
- Typed nullable columns on the existing `listings` table (NOT a single jsonb blob) for matcher + facets; a `scholarship_meta` jsonb holds only the long tail.
- Ship ALL programs (incl. unverified LGU) with a `is_verified` badge + "verify on official site" disclaimer + outbound link. Coverage over gating.
- **Matcher inputs collected in onboarding** (income bracket + GWA + province), available app-wide and reusable by Epics D/E.

---

## 1. Goal

Grow the scholarship directory from ~8 listings to ~135 programs (≈22 national + ≈113 LGU + a DLSU/DCAT aid-window refresh) with rich, typed detail (eligibility, income ceiling, GWA, benefits, service-obligation warnings, requirements checklist), an **eligibility matcher** personalized from onboarding data, filterable facets (provider / region / province / level / verified / "near you" / "eligible for me"), and HUC-exclusion warnings — all reusing the existing `listings` detail screen and sync pipeline.

## 2. Non-goals (explicitly deferred)

- The full Listings-tab restructure into Universities / Scholarships / Courses with AI-Safe-Score (that is Epic C + D; Epic B keeps the existing Listings tab and enriches the Scholarships segment).
- Requirements-vault / document upload (deferred MVP decision).
- A generic admin CSV-import UI for listings (the source data is one-time unstructured flat-files; we ingest via parser → committed seed SQL, mirroring the Epic A facts seed). The admin **edit** surface is extended for the new fields, but bulk ingestion is the seed.
- Course-taxonomy reconciliation with Epic C/D (Epic B stores `target_courses` free-text as today).

## 3. Architecture overview

Six sub-areas, mirroring Epic A's A1–A4 layering:

- **B1 — Schema:** migration `019` adds typed columns to `listings` + `province`/`city` to `profiles`; mobile Drizzle/SQLite mirror; `user_settings` gains `income_bracket`, `gwa`, `province`, `city`.
- **B2 — Data ingestion:** two Node parser scripts (national flat-file, LGU flat-file) reusing the A1 cleaners (`stripBom`, `decodeMojibake`, `resolveSentinel`, `canonicalizeRegion`) → committed idempotent seed SQL (`ON CONFLICT (slug) DO UPDATE`); a small DLSU/DCAT date refresh. Applied via Supabase MCP in the final batch.
- **B3 — Eligibility matcher:** a pure, fully-tested util (`apps/mobile/utils/scholarshipMatch.ts`) — no I/O — that scores a listing against a student profile and returns `{ status, reasons, warnings }`.
- **B4 — Onboarding:** a new optional step collects income bracket + GWA + province (province defaulted from the chosen school when resolvable); written to `user_settings` and synced to `profiles`.
- **B5 — Scholarships UI:** browse facets + "eligible for me" + "near you"; detail-screen enrichment (income ceiling, GWA, stipend, service-obligation warning, verified badge, HUC-exclusion warning).
- **B6 — Sync:** extend the `listings` select + mobile upsert with the new columns; mirror `scholarship_meta`.

## 4. Data model (B1)

### 4.1 `listings` typed columns (migration 019) — additive, all nullable/defaulted

| Column | Type | Purpose / matcher use |
|---|---|---|
| `province` | text | "near you" + LGU residency match (canonicalized) |
| `city` | text | city-LGU programs + HUC detection |
| `scope` | text CHECK IN ('national','regional','provincial','city','school') DEFAULT 'national' | facet + residency logic |
| `is_verified` | boolean NOT NULL DEFAULT false | confidence badge |
| `income_ceiling` | numeric | annual gross family income cap in ₱ (NULL = no means test / unknown) |
| `gwa_requirement` | numeric | minimum GWA as a **percentage** 0–100 (NULL = none/unknown) |
| `monthly_stipend` | numeric | ₱/month (NULL unknown) |
| `service_obligation_years` | int | years of mandatory service (NULL/0 = none) |
| `has_entrance_exam` | boolean NOT NULL DEFAULT false | whether the program has its own exam |
| `application_window` | text | human string ("October–November", "Year-round") — recurring vs absolute kept as text |
| `scholarship_meta` | jsonb NOT NULL DEFAULT '{}' | long tail: documentary_requirements[], other_benefits[], contact, slots, renewal_gwa, citizenship, tuition_coverage, source_url, notes, huc_excluded(bool) |

Indexes: `listings(scope)`, `listings(province)`, `listings(is_verified)`. RLS unchanged (public read; admin write already present).

Note: existing `region`, `grant_amount`, `deadline`, `requirements text[]`, `target_year_levels`, `target_courses`, `external_url`, `provider`, `coverage`, `description`, `tags` are reused as-is. `target_year_levels` carries year-level eligibility; `requirements` carries the documentary checklist already rendered by `RequirementsChecklist`.

### 4.2 `profiles` (Supabase)

Add `province text`, `city text` (synced from onboarding). `year_level` already exists; Epic B starts populating it from `user_settings` (currently unpopulated — see brief §5).

### 4.3 Mobile mirror

- `apps/mobile/db/schema.ts` `listings`: add `province`, `city`, `scope`, `isVerified` (int boolean), `incomeCeiling`, `gwaRequirement`, `monthlyStipend`, `serviceObligationYears`, `hasEntranceExam` (int boolean), `applicationWindow`, `scholarshipMeta` (text JSON).
- `apps/mobile/db/client.ts` MIGRATIONS: append `ALTER TABLE listings ADD COLUMN ...` for each (idempotent try/catch already wraps them).
- `user_settings`: add `income_bracket TEXT`, `gwa REAL`, `province TEXT`, `city TEXT` (via MIGRATIONS ALTERs); extend the settings read/write helpers.

## 5. Data ingestion (B2)

### 5.1 Sources (in `…/Iskotify Upgrades/_extracted/`)
- `philippine_national_scholarships_database.txt` — ~22 programs (12 government + 10 private), Windows-1252 mojibake, label|value blocks, ~30 fields each.
- `lgu_political_scholarships.txt` — ~113 entries (provincial + city), ~28 verified / ~53 unverified; structured labeled blocks.
- `admissions_update_20260603.txt` item #6 — DLSU/DCAT St. La Salle Grant window (April 17–May 17 2026) → field refresh on the existing `dcat-dlsu` slug.

### 5.2 Approach
Two parser scripts under `scripts/` (e.g. `parse-national-scholarships.mjs`, `parse-lgu-scholarships.mjs`), self-contained (like `scripts/import-upcat-questions.mjs`), reusing the A1 cleaner logic (ported/inlined): strip BOM, fix mojibake, map `UNCONFIRMED/TBA/Unknown/N/A → NULL`, normalize currency ("₱8,000/month" → `monthly_stipend=8000`), canonicalize region. Each emits a committed idempotent seed file:
- `supabase/seed/scholarships_national_seed.sql`
- `supabase/seed/scholarships_lgu_seed.sql`

Both use `INSERT INTO listings (...) VALUES (...) ON CONFLICT (slug) DO UPDATE SET ...`. `slug` derived deterministically (e.g. `dost-sei-merit`, `lgu-r1-iln-001`). `type='scholarship'`. Unverified rows set `is_verified=false`. Currency/percentage normalization is unit-tested on a few representative blocks.

**Quality gate:** because the flat-files are messy and the typed fields feed a matcher, the plan will include a verification pass — a spot-check of N parsed rows against the source text, and a row-count + null-rate report — before the seed is committed. (Authoring-by-subagent is the fallback for blocks the parser can't reliably structure.)

### 5.3 HUC exclusion
A Highly Urbanized City (HUC) is independent of its province, so provincial-LGU programs generally exclude HUC residents. The parser sets `scholarship_meta.huc_excluded=true` for provincial-scope programs; the matcher warns a student whose `city` is a known HUC (small static HUC list in the matcher util) when viewing a provincial program for that province.

## 6. Eligibility matcher (B3)

`apps/mobile/utils/scholarshipMatch.ts` — pure functions, Jest-tested (the A-grade pattern from `upcatExam.ts`).

```
type IncomeBracket = '<=100k'|'100k-300k'|'300k-600k'|'600k-1.2M'|'>1.2M'|'unknown'
interface StudentProfile { gradeLevel?: number; incomeBracket?: IncomeBracket; gwa?: number; province?: string; city?: string }
type MatchStatus = 'eligible' | 'likely' | 'maybe' | 'ineligible' | 'unknown'
interface MatchResult { status: MatchStatus; reasons: string[]; warnings: string[] }
matchScholarship(listing, student): MatchResult
```

Rules (each contributes a reason/warning; honest, never a guarantee):
- **Income:** map bracket → a representative band; if `income_ceiling` set and the student band's lower bound > ceiling → `ineligible` ("family income likely exceeds ₱X ceiling"); if band straddles → `maybe` with warning; if comfortably under → pass. `unknown` bracket + means-tested program → `maybe` ("income-based — confirm you qualify").
- **GWA:** if `gwa_requirement` set and `student.gwa < requirement` → `ineligible` ("requires GWA ≥ X%"); within 2 pts → `maybe`.
- **Year level:** `target_year_levels` vs `gradeLevel` (most require Grade 12 / SHS graduate).
- **Residency (LGU):** `scope in (provincial,city)` and `student.province !== listing.province` → `ineligible` ("for residents of {province}"). HUC warning per §5.3.
- **Verified:** `is_verified=false` always adds a warning ("unverified — confirm on the official site").
- Aggregation: worst-of rule for status; collect all reasons/warnings. A program with no typed criteria + verified → `eligible` (informational).

The matcher is the single source of truth used by both the "eligible for me" browse filter and the detail-screen status pill.

## 7. Onboarding (B4)

Add one optional step (after the existing school/grade step, before pre-assessment so it doesn't gate account creation — consistent with the "skippable pre-assessment" beta decision):
- **Income bracket** — single-select chips (the 5 bands + "Prefer not to say").
- **GWA** — numeric input (75–100) with a "skip" affordance; helper text "your latest general weighted average (percentage)".
- **Province** — picker defaulted from the chosen school's province (derived via the `schools` table when the stored school resolves); editable.

Persist to `user_settings` (income_bracket, gwa, province, city) and sync province/city + year_level to `profiles`. All fields optional; skipping leaves the matcher in facets-only mode for that user.

## 8. Scholarships UI (B5)

Reuse the existing `apps/mobile/app/(tabs)/listings.tsx` Scholarships segment and `apps/mobile/app/listings/[slug].tsx` detail.

**Browse (Scholarships segment):**
- New facet chips: Provider, Region, Province, Verified-only, **Near me** (province match), **Eligible for me** (runs `matchScholarship` against `user_settings`, shows `eligible`+`likely`).
- Each card gains: a verified badge, a small match pill (e.g. "✓ Eligible" / "Likely" / "Check income"), and province.

**Detail enrichment:**
- Match status pill at top (from `matchScholarship`) with reasons.
- New rows: income ceiling, minimum GWA, monthly stipend, application window, scope/region/province chips.
- **Service-obligation warning** banner when `service_obligation_years > 0` ("Requires N year(s) of service after graduation").
- **HUC-exclusion warning** when applicable.
- Verified badge + persistent "Details change yearly — verify on the official site" + `external_url` button.
- Requirements checklist (existing `RequirementsChecklist`) fed by `requirements`; `scholarship_meta.other_benefits` rendered under Benefits.

## 9. Sync + Admin (B6)

- `apps/mobile/services/sync.ts`: extend the `listings` `.select(...)` with the new columns; map them in the upsert (booleans via `!!`, `scholarship_meta` via `JSON.stringify`). Keep the incremental `gt('updated_at', since)` cursor (listings already has the `updated_at` trigger).
- Admin `ListingDrawer.tsx`: add inputs for province, city, scope, is_verified, income_ceiling, gwa_requirement, monthly_stipend, service_obligation_years, has_entrance_exam, application_window (the long-tail `scholarship_meta` editable as raw JSON or omitted from the drawer for v1). This lets staff correct/verify seeded rows.

## 10. Testing strategy

- **B2:** unit tests for currency/percentage/sentinel normalization + slug derivation on representative source blocks; a parsed-row count + null-rate report.
- **B3:** exhaustive Jest tests for `matchScholarship` (each rule, each status, HUC warning, unknown-input behavior) — the highest-value tests in the epic.
- **B4:** onboarding step persists + reads back; province derivation from school.
- **B5:** card/detail render with new fields; "eligible for me" filter integration test against an in-memory seeded listings set.
- **B6:** sync writes new columns into SQLite (extend the real-SQLite sync test, mirroring the Epic A pattern); `scholarship_meta` round-trips.
- Full admin + mobile suites green; admin build clean.

## 11. Delivery

Per the locked delivery decision, migration 019 + the two seeds are **applied via Supabase MCP now/at end** and the mobile JS ships in the single final-batch OTA. No per-epic OTA.

## 12. Sequencing (plan will expand to bite-sized TDD tasks)

1. B1 schema (migration 019 + mobile mirror + user_settings).
2. B3 matcher util + tests (pure, no deps — can parallel B1).
3. B2 parsers → seeds (+ normalization tests, verification pass).
4. B6 sync + admin drawer.
5. B4 onboarding step.
6. B5 browse facets + detail enrichment.
7. Verify (suites + build); apply 019 + seeds via MCP; data-count verification.

## 13. Open questions (resolve during planning)

- GWA scale: collect as percentage (75–100); convert any 1.0–5.0 scholarship requirements to percentage during authoring. (Proposed: yes.)
- Income band → numeric mapping for the matcher (use band lower bound for conservative "eligible", straddle → "maybe"). (Proposed as in §6.)
- Whether `scholarship_meta` is editable in the admin drawer v1 or left to seed-only. (Proposed: seed-only for v1; typed fields editable.)
